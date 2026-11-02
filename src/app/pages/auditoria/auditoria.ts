import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorPlsql, FilaAuditoria, PlsqlService, leerErrorPlsql } from '../../core/plsql';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const POR_PAGINA = 15;

type Filtro = 'TODAS' | 'INSERT' | 'UPDATE' | 'DELETE';

/** Historial de cambios de tarifas guardado por el disparador trg_auditoria_tarifa. */
@Component({
  selector: 'app-auditoria',
  imports: [FormsModule],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.css',
})
export class Auditoria {
  private api = inject(PlsqlService);

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

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.listarAuditoria().subscribe({
      next: (filas) => {
        this.filas.set(filas);
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
