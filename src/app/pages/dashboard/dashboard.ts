import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { Columna, REPORTES, Reporte, ReportesService } from '../../core/reportes';

type Fila = Record<string, unknown>;

const POR_PAGINA = 15;

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private auth = inject(AuthService);
  private router = inject(Router);
  private api = inject(ReportesService);

  readonly reportes = REPORTES;
  readonly usuario = this.auth.usuario;

  seleccionado = signal<Reporte>(REPORTES[0]);
  filas = signal<Fila[]>([]);
  cargando = signal(false);
  error = signal('');
  aviso = signal('');
  pagina = signal(1);
  menuAbierto = signal(false);

  fechaInicio = '2024-01-01';
  fechaFin = '2024-03-31';

  /** Resultados ya consultados, para no volver a pedirlos al cambiar de pestaña. */
  private cache = new Map<string, Fila[]>();

  totalPaginas = computed(() => Math.max(1, Math.ceil(this.filas().length / POR_PAGINA)));

  visibles = computed(() => {
    const inicio = (this.pagina() - 1) * POR_PAGINA;
    return this.filas().slice(inicio, inicio + POR_PAGINA);
  });

  constructor() {
    this.cargar();
  }

  seleccionar(reporte: Reporte): void {
    this.menuAbierto.set(false);
    if (reporte.id === this.seleccionado().id) return;
    this.seleccionado.set(reporte);
    this.aviso.set('');
    this.pagina.set(1);
    this.cargar();
  }

  cargar(forzar = false): void {
    const reporte = this.seleccionado();
    const clave = reporte.conFechas ? `${reporte.id}|${this.fechaInicio}|${this.fechaFin}` : reporte.id;

    this.error.set('');
    if (!forzar && this.cache.has(clave)) {
      this.filas.set(this.cache.get(clave)!);
      return;
    }

    if (reporte.conFechas && this.fechaFin < this.fechaInicio) {
      this.filas.set([]);
      this.error.set('La fecha final no puede ser anterior a la fecha inicial.');
      return;
    }

    this.cargando.set(true);
    this.filas.set([]);
    this.api.consultar(reporte, this.fechaInicio, this.fechaFin).subscribe({
      next: (datos) => {
        this.cache.set(clave, datos);
        // Solo pinta si el usuario sigue en la misma consulta
        if (this.seleccionado().id === reporte.id) {
          this.filas.set(datos);
          this.pagina.set(1);
        }
        this.cargando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(
          err.status === 0
            ? 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo en el puerto 8080.'
            : `El servidor respondió con un error (${err.status}). Revisa la consola del backend.`
        );
      },
    });
  }

  refrescarVista(): void {
    this.cargando.set(true);
    this.aviso.set('');
    this.api.refrescarVistaMaterializada().subscribe({
      next: () => {
        this.aviso.set('Vista materializada actualizada.');
        this.cargar(true);
      },
      error: () => {
        this.cargando.set(false);
        this.error.set('No se pudo refrescar la vista materializada.');
      },
    });
  }

  irA(pagina: number): void {
    this.pagina.set(Math.min(Math.max(1, pagina), this.totalPaginas()));
  }

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  // ---------- Presentación de celdas ----------

  formato(fila: Fila, col: Columna): string {
    const valor = fila[col.campo];
    if (valor === null || valor === undefined || valor === '') return '—';
    switch (col.tipo) {
      case 'dinero':
        return dinero.format(Number(valor));
      case 'numero':
        return numero.format(Number(valor));
      case 'porcentaje': {
        const n = Number(valor);
        return `${n > 0 ? '+' : ''}${numero.format(n)} %`;
      }
      case 'fecha': {
        // Solo la parte AAAA-MM-DD leída como hora local; si no, el desfase con UTC muestra el día anterior
        const dia = String(valor).slice(0, 10);
        return new Date(`${dia}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      default:
        return String(valor);
    }
  }

  esNumerica(col: Columna): boolean {
    return ['numero', 'dinero', 'porcentaje'].includes(col.tipo);
  }

  /** Clase para variaciones positivas / negativas (consulta 4). */
  signo(fila: Fila, col: Columna): string {
    if (col.campo !== 'variacion' && col.campo !== 'variacionPorcentaje') return '';
    const n = Number(fila[col.campo]);
    if (fila[col.campo] == null || n === 0) return '';
    return n > 0 ? 'sube' : 'baja';
  }

  /** Filas de subtotal del ROLLUP (consulta 2). */
  esTotal(fila: Fila): boolean {
    return this.seleccionado().id === 'ingresos' && Object.values(fila).includes('TOTAL');
  }

  estrellas(fila: Fila): number {
    return Math.round(Number(fila['calificacionPromedio']) || 0);
  }
}
