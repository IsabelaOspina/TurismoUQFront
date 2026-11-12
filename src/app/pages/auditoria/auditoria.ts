import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ErrorPlsql, FilaAuditoria, PlsqlService, leerErrorPlsql } from '../../core/plsql';
import { AuthService } from '../../core/auth.service';
import { API_URL } from '../../core/api.config';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const POR_PAGINA = 15;

type Filtro = 'TODAS' | 'INSERT' | 'UPDATE' | 'DELETE';

interface TarifaMes {
  mes: number;
  temporada: string;
  tipo: string;
  precioNoche: number | null;
}

type Accion = 'crear' | 'editar' | 'eliminar' | 'ajustar';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Tarifas de una habitación (crear, editar, eliminar) e historial que guarda el disparador trg_auditoria_tarifa. */
@Component({
  selector: 'app-auditoria',
  imports: [FormsModule],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.css',
})
export class Auditoria {
  private api = inject(PlsqlService);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // ---------- Tarifas de una habitación ----------
  readonly tipos = ['ALTA', 'MEDIA', 'BAJA'];

  habTarifas = signal<number | null>(null);
  tarifas = signal<TarifaMes[]>([]);
  buscando = signal(false);
  editando = signal<number | null>(null);
  precio = signal<number | null>(null);
  tipoAjuste = signal('ALTA');
  porcentaje = signal<number | null>(10);
  guardando = signal(false);
  errorTarifa = signal<ErrorPlsql | null>(null);
  aviso = signal('');
  nuevos = signal<number[]>([]);
  private espera?: ReturnType<typeof setTimeout>;

  readonly operaciones: { id: Filtro; nombre: string }[] = [
    { id: 'TODAS', nombre: 'Todas' },
    { id: 'INSERT', nombre: 'Creadas' },
    { id: 'UPDATE', nombre: 'Modificadas' },
    { id: 'DELETE', nombre: 'Eliminadas' },
  ];

  filas = signal<FilaAuditoria[]>([]);
  cargando = signal(false);
  error = signal<ErrorPlsql | null>(null);
  filtro = signal<Filtro>('TODAS');
  habitacion = signal('');
  pagina = signal(1);

  /** Filas que cumplen el filtro de operación y de habitación. */
  filtradas = computed(() => {
    const op = this.filtro();
    const hab = this.habitacion().trim();
    return this.filas().filter(
      (f) => (op === 'TODAS' || f.tipoOperacion === op) && (!hab || String(f.idHabitacion) === hab)
    );
  });

  conteo = computed(() => {
    const filas = this.filas();
    return {
      total: filas.length,
      creadas: filas.filter((f) => f.tipoOperacion === 'INSERT').length,
      modificadas: filas.filter((f) => f.tipoOperacion === 'UPDATE').length,
      eliminadas: filas.filter((f) => f.tipoOperacion === 'DELETE').length,
    };
  });

  totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtradas().length / POR_PAGINA)));
  visibles = computed(() => {
    const inicio = (this.pagina() - 1) * POR_PAGINA;
    return this.filtradas().slice(inicio, inicio + POR_PAGINA);
  });

  /** id_temporada → número de mes, para mostrar el mes en el historial. */
  private mesDeTemporada = signal<Record<number, number>>({});

  constructor() {
    this.cargar();
    this.http.get<{ idTemporada: number; mes: number }[]>(`${API_URL}/tarifas/temporadas`).subscribe({
      next: (lista) => this.mesDeTemporada.set(Object.fromEntries(lista.map((t) => [t.idTemporada, t.mes]))),
    });
  }

  mesHistorial(idTemporada: number): string {
    const mes = this.mesDeTemporada()[idTemporada];
    return mes ? MESES[mes - 1] : String(idTemporada);
  }

  /** Descarga el historial filtrado como CSV (se abre en Excel). */
  descargar(): void {
    const encabezado = ['Fecha y hora', 'Usuario', 'Operación', 'Habitación', 'Mes', 'Valor anterior', 'Valor nuevo', 'Variación'];
    const lineas = this.filtradas().map((f) => [
      this.fechaHora(f.fechaCambio),
      f.usuario,
      this.nombreOperacion(f.tipoOperacion),
      f.idHabitacion,
      this.mesHistorial(f.idTemporada),
      f.valorAnterior ?? '',
      f.valorNuevo ?? '',
      this.variacion(f) ?? '',
    ]);
    const csv = [encabezado, ...lineas]
      .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    // El BOM (\uFEFF) hace que Excel lea bien las tildes
    const archivo = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = `auditoria_tarifas_${new Date().toLocaleDateString('sv-SE')}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.listarAuditoria().subscribe({
      next: (filas) => {
        this.filas.set(filas);
        this.filtro.set('TODAS');
        this.habitacion.set('');
        this.pagina.set(1);
        this.cargando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.cargando.set(false);
        this.filas.set([]);
        this.error.set(leerErrorPlsql(err));
      },
    });
  }

  /** Carga los 12 meses de la habitación escrita. */
  buscarTarifas(): void {
    clearTimeout(this.espera);
    this.cancelar();
    this.errorTarifa.set(null);
    this.aviso.set('');
    const hab = this.habTarifas();
    if (!hab || hab < 1) {
      this.tarifas.set([]);
      return;
    }
    this.espera = setTimeout(() => this.traerTarifas(hab), 350);
  }

  private traerTarifas(hab: number): void {
    this.buscando.set(true);
    const params = new HttpParams().set('idHabitacion', hab);
    this.http.get<TarifaMes[]>(`${API_URL}/tarifas`, { params }).subscribe({
      next: (t) => {
        this.tarifas.set(t);
        this.buscando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.tarifas.set([]);
        this.buscando.set(false);
        this.errorTarifa.set(leerErrorPlsql(err));
      },
    });
  }

  /** Abre la fila para crear o editar el precio. */
  abrir(t: TarifaMes): void {
    this.editando.set(t.mes);
    this.precio.set(t.precioNoche);
    this.errorTarifa.set(null);
  }

  cancelar(): void {
    this.editando.set(null);
    this.precio.set(null);
  }

  guardar(t: TarifaMes): void {
    const p = Number(this.precio());
    if (!p || p <= 0) {
      this.errorTarifa.set({ codigo: '', titulo: 'Precio no válido', mensaje: 'Debe ser mayor que cero.' });
      return;
    }
    this.ejecutar(t.precioNoche === null ? 'crear' : 'editar', { mes: t.mes, precioNoche: p });
  }

  eliminar(t: TarifaMes): void {
    this.ejecutar('eliminar', { mes: t.mes });
  }

  ajustar(): void {
    const pct = Number(this.porcentaje());
    if (!pct || pct <= -100) {
      this.errorTarifa.set({ codigo: '', titulo: 'Porcentaje no válido', mensaje: 'Escribe un valor como 10 o -5.' });
      return;
    }
    this.ejecutar('ajustar', { tipo: this.tipoAjuste(), porcentaje: pct });
  }

  /** Envía el cambio; el disparador lo registra y se recargan las dos tablas. */
  private ejecutar(accion: Accion, datos: Record<string, unknown>): void {
    const hab = this.habTarifas();
    if (!hab) return;
    this.guardando.set(true);
    this.errorTarifa.set(null);
    const cuerpo = { idHabitacion: hab, usuario: this.auth.usuario()?.correo ?? null, ...datos };
    this.http.post<{ filas: number; idsAuditoria: number[] }>(`${API_URL}/tarifas/${accion}`, cuerpo).subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.cancelar();
        this.nuevos.set(r.idsAuditoria);
        this.aviso.set(this.textoAviso(accion, r.filas));
        this.traerTarifas(hab);
        this.cargar();
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorTarifa.set(leerErrorPlsql(err));
      },
    });
  }

  private textoAviso(accion: Accion, filas: number): string {
    if (accion === 'crear') return 'Tarifa creada.';
    if (accion === 'eliminar') return 'Tarifa eliminada.';
    return filas === 1 ? 'Tarifa actualizada.' : `${filas} tarifas actualizadas.`;
  }

  nombreMes(mes: number): string {
    return MESES[mes - 1];
  }

  cambiarFiltro(f: Filtro): void {
    this.filtro.set(f);
    this.pagina.set(1);
  }

  cambiarHabitacion(valor: string): void {
    this.habitacion.set(valor);
    this.pagina.set(1);
  }

  irA(pagina: number): void {
    this.pagina.set(Math.min(Math.max(1, pagina), this.totalPaginas()));
  }

  // ---------- Presentación ----------

  nombreOperacion(op: string): string {
    return op === 'INSERT' ? 'Creada' : op === 'UPDATE' ? 'Modificada' : op === 'DELETE' ? 'Eliminada' : op;
  }

  fechaHora(valor: string): string {
    if (!valor) return '—';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return valor;
    // Formato corto para que la tabla quepa: "30 oct 2026, 14:05"
    const mes = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${d.getDate()} ${mes} ${d.getFullYear()}, ${hora}`;
  }

  moneda(n: number | null): string {
    return n === null || n === undefined ? '—' : dinero.format(Number(n));
  }

  /** Diferencia entre el valor nuevo y el anterior (solo en modificaciones). */
  variacion(f: FilaAuditoria): number | null {
    if (f.valorAnterior === null || f.valorNuevo === null) return null;
    return Number(f.valorNuevo) - Number(f.valorAnterior);
  }

  variacionTexto(f: FilaAuditoria): string {
    const v = this.variacion(f);
    if (v === null) return '—';
    if (v === 0) return 'Sin cambio';
    return `${v > 0 ? '+' : '−'}${dinero.format(Math.abs(v))}`;
  }
}
