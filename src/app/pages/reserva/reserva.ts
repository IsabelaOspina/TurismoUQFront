import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorPlsql, NuevaReserva, PlsqlService, leerErrorPlsql } from '../../core/plsql';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

@Component({
  selector: 'app-reserva',
  imports: [FormsModule],
  templateUrl: './reserva.html',
  styleUrl: './reserva.css',
})
export class Reserva {
  private api = inject(PlsqlService);

  datos: NuevaReserva = {
    idCliente: 1,
    idHabitacion: 1,
    fechaIn: '2026-12-10',
    fechaOut: '2026-12-14',
    numeroPersonas: 2,
  };

  procesando = signal<'' | 'precio' | 'confirmar'>('');
  /** Precio calculado para las fechas y la habitación actuales. */
  precio = signal<number | null>(null);
  creada = signal<{ idReserva: number; valor: number | null } | null>(null);
  error = signal<ErrorPlsql | null>(null);

  noches(): number {
    const { fechaIn, fechaOut } = this.datos;
    if (!fechaIn || !fechaOut) return 0;
    return Math.round((Date.parse(fechaOut) - Date.parse(fechaIn)) / 86_400_000);
  }

  fechaLarga(iso: string): string {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Al cambiar cualquier dato, el precio y el resultado anteriores dejan de ser válidos. */
  cambio(): void {
    this.precio.set(null);
    this.creada.set(null);
    this.error.set(null);
  }

  calcularPrecio(): void {
    if (!this.validarCampos(['idHabitacion', 'fechaIn', 'fechaOut'])) return;
    this.cambio();
    this.procesando.set('precio');
    this.api.valorEstadia(this.datos.idHabitacion!, this.datos.fechaIn, this.datos.fechaOut).subscribe({
      next: ({ valor }) => {
        this.precio.set(valor);
        this.procesando.set('');
      },
      error: (err: HttpErrorResponse) => this.fallo(err),
    });
  }

  confirmar(): void {
    if (!this.validarCampos(['idCliente', 'idHabitacion', 'fechaIn', 'fechaOut', 'numeroPersonas'])) return;
    this.creada.set(null);
    this.error.set(null);
    this.procesando.set('confirmar');
    this.api.crearReserva(this.datos).subscribe({
      next: ({ idReserva }) => {
        this.procesando.set('');
        this.creada.set({ idReserva, valor: this.precio() });
        if (this.precio() === null) {
          // Muestra el valor que calculó el procedimiento
          this.api.valorEstadia(this.datos.idHabitacion!, this.datos.fechaIn, this.datos.fechaOut).subscribe({
            next: ({ valor }) => {
              this.precio.set(valor);
              this.creada.set({ idReserva, valor });
            },
            error: () => {},
          });
        }
      },
      error: (err: HttpErrorResponse) => this.fallo(err),
    });
  }

  moneda(n: number): string {
    return dinero.format(n);
  }

  private fallo(err: HttpErrorResponse): void {
    this.procesando.set('');
    this.error.set(leerErrorPlsql(err));
  }

  private validarCampos(campos: (keyof NuevaReserva)[]): boolean {
    const falta = campos.some((c) => this.datos[c] === null || this.datos[c] === '');
    if (falta) {
      this.creada.set(null);
      this.error.set({ codigo: '', titulo: 'Faltan datos', mensaje: 'Completa todos los campos antes de continuar.' });
    }
    return !falta;
  }
}
