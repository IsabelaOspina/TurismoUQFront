import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ErrorPlsql, FilaLiquidacion, PlsqlService, leerErrorPlsql } from '../../core/plsql';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const POR_PAGINA = 20;

type Tipo = 'mensual' | 'temporada';
type Filtro = 'TODAS' | 'ALTA' | 'MEDIA' | 'BAJA';

/**
 * Liquidación mensual (sp_liquidacion_mensual) y liquidación por temporada de
 * un año (sp_liquidacion_temporada). Las dos guardan su resultado en una tabla.
 */
@Component({
  selector: 'app-liquidacion',
  imports: [FormsModule],
  templateUrl: './liquidacion.html',
  styleUrl: './liquidacion.css',
})
export class Liquidacion {
  private api = inject(PlsqlService);

  readonly meses = MESES.map((nombre, i) => ({ numero: i + 1, nombre }));
  readonly anios = [2024, 2025, 2026];
  readonly filtros: { id: Filtro; texto: string }[] = [
    { id: 'TODAS', texto: 'Todas' },
    { id: 'ALTA', texto: 'Alta' },
    { id: 'MEDIA', texto: 'Media' },
    { id: 'BAJA', texto: 'Baja' },
  ];

  anio = 2025;
  mes = 3;

  tipo = signal<Tipo>('mensual');
  filtro = signal<Filtro>('TODAS');
  pagina = signal(1);

  filas = signal<FilaLiquidacion[]>([]);
  cargando = signal<'' | 'generar' | 'consultar'>('');
  error = signal<ErrorPlsql | null>(null);
  /** Periodo mostrado y si viene de ejecutar el proceso o de leer la tabla. */
  periodo = signal<{ texto: string; generada: boolean; tipo: Tipo } | null>(null);

  /** Filas visibles según la temporada elegida (solo aplica en la liquidación por temporada). */
  filtradas = computed(() => {
    const f = this.filtro();
    return f === 'TODAS' ? this.filas() : this.filas().filter((x) => x.temporada === f);
  });

  totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtradas().length / POR_PAGINA)));
  visibles = computed(() => this.filtradas().slice((this.pagina() - 1) * POR_PAGINA, this.pagina() * POR_PAGINA));

  totales = computed(() =>
    this.filtradas().reduce(
      (t, f) => ({
        reservas: t.reservas + Number(f.totalReservas),
        ingresos: t.ingresos + Number(f.ingresos),
        pagado: t.pagado + Number(f.pagado),
        saldo: t.saldo + Number(f.saldoPendiente),
      }),
      { reservas: 0, ingresos: 0, pagado: 0, saldo: 0 }
    )
  );

  /** Facturado de cada temporada en el año, para el resumen de arriba. */
  porTemporada = computed(() =>
    (['ALTA', 'MEDIA', 'BAJA'] as const).map((t) => {
      const filas = this.filas().filter((f) => f.temporada === t);
      return {
        tipo: t,
        reservas: filas.reduce((s, f) => s + Number(f.totalReservas), 0),
        ingresos: filas.reduce((s, f) => s + Number(f.ingresos), 0),
      };
    })
  );

  cambiarTipo(tipo: Tipo): void {
    if (tipo === this.tipo()) return;
    this.tipo.set(tipo);
    this.filas.set([]);
    this.periodo.set(null);
    this.error.set(null);
    this.filtro.set('TODAS');
    this.pagina.set(1);
  }

  cambiarFiltro(f: Filtro): void {
    this.filtro.set(f);
    this.pagina.set(1);
  }

  irA(p: number): void {
    this.pagina.set(Math.min(Math.max(1, p), this.totalPaginas()));
  }

  generar(): void {
    const peticion = this.tipo() === 'mensual'
      ? this.api.generarLiquidacion(this.anio, this.mes)
      : this.api.generarLiquidacionTemporada(this.anio);
    this.ejecutar('generar', peticion);
  }

  consultar(): void {
    const peticion = this.tipo() === 'mensual'
      ? this.api.consultarLiquidacion(this.anio, this.mes)
      : this.api.consultarLiquidacionTemporada(this.anio);
    this.ejecutar('consultar', peticion);
  }

  nombreTemporada(t: string): string {
    return t ? t.charAt(0) + t.slice(1).toLowerCase() : '';
  }

  moneda(n: number): string {
    return dinero.format(Number(n));
  }

  cantidad(n: number): string {
    return numero.format(Number(n));
  }

  porcentajePagado(f: FilaLiquidacion): number {
    const ingresos = Number(f.ingresos);
    return ingresos > 0 ? Math.min(100, Math.round((Number(f.pagado) / ingresos) * 100)) : 0;
  }

  private ejecutar(accion: 'generar' | 'consultar', peticion: Observable<FilaLiquidacion[]>): void {
    const tipo = this.tipo();
    const texto = tipo === 'mensual' ? `${MESES[this.mes - 1].toLowerCase()} de ${this.anio}` : `${this.anio}`;
    this.cargando.set(accion);
    this.error.set(null);
    peticion.subscribe({
      next: (filas) => {
        this.filas.set(filas);
        this.filtro.set('TODAS');
        this.pagina.set(1);
        this.periodo.set({ texto, generada: accion === 'generar', tipo });
        this.cargando.set('');
      },
      error: (err: HttpErrorResponse) => {
        this.cargando.set('');
        this.filas.set([]);
        this.periodo.set(null);
        this.error.set(leerErrorPlsql(err));
      },
    });
  }
}
