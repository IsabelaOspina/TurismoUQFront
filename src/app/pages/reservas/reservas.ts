import { Component, signal } from '@angular/core';
import { Reserva, ReservaInicial } from '../reserva/reserva';
import { ReservaPago } from '../reserva-pago/reserva-pago';
import { CancelarReserva } from '../cancelar-reservas/cancelar-reserva';

type Pestana = 'nueva' | 'pago' | 'editar' | 'cancelar';

/** Sección Reservas: nueva, con pago (transacción), editar y cancelar. */
@Component({
  selector: 'app-reservas',
  imports: [Reserva, ReservaPago, CancelarReserva],
  templateUrl: './reservas.html',
  styleUrl: './reservas.css',
})
export class Reservas {
  readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'nueva', titulo: 'Nueva' },
    { id: 'pago', titulo: 'Con pago' },
    { id: 'editar', titulo: 'Editar' },
    { id: 'cancelar', titulo: 'Cancelar' },
  ];

  pestana = signal<Pestana>('nueva');
  /** Reserva que se abre en "Editar" (la recién creada), o null para empezar vacío. */
  reservaAEditar = signal<ReservaInicial | null>(null);

  abrir(p: Pestana): void {
    this.reservaAEditar.set(null);
    this.pestana.set(p);
  }

  /** Desde "Nueva": abre la reserva recién creada para modificarla. */
  editarCreada(reserva: ReservaInicial): void {
    this.reservaAEditar.set(reserva);
    this.pestana.set('editar');
  }
}
