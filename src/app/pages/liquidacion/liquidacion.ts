import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ErrorPlsql, FilaLiquidacion, PlsqlService, leerErrorPlsql } from '../../core/plsql';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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

  anio = 2025;
  mes = 3;

  filas = signal<FilaLiquidacion[]>([]);
  cargando = signal<'' | 'generar' | 'consultar'>('');
  error = signal<ErrorPlsql | null>(null);
  /** Mes mostrado y si viene de ejecutar el proceso o de leer la tabla. */
  periodo = signal<{ texto: string; generada: boolean } | null>(null);

  totales = computed(() =>
    this.filas().reduce(
      (t, f) => ({
        reservas: t.reservas + Number(f.totalReservas),
        ingresos: t.ingresos + Number(f.ingresos),
        pagado: t.pagado + Number(f.pagado),
        saldo: t.saldo + Number(f.saldoPendiente),
      }),
      { reservas: 0, ingresos: 0, pagado: 0, saldo: 0 }
    )
  );

  generar(): void {
    this.ejecutar('generar', this.api.generarLiquidacion(this.anio, this.mes));
  }

  consultar(): void {
    this.ejecutar('consultar', this.api.consultarLiquidacion(this.anio, this.mes));
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
    const texto = `${MESES[this.mes - 1].toLowerCase()} de ${this.anio}`;
    this.cargando.set(accion);
    this.error.set(null);
    peticion.subscribe({
      next: (filas) => {
        this.filas.set(filas);
        this.periodo.set({ texto, generada: accion === 'generar' });
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
