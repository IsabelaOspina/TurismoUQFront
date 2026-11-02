import { Component, signal } from '@angular/core';
import { Reserva, ReservaInicial } from '../reserva/reserva';
import { ReservaPago } from '../reserva-pago/reserva-pago';

type Pestana = 'nueva' | 'pago' | 'editar';

/** Sección Reservas: nueva reserva, reserva con pago (transacción) y editar reserva. */
@Component({
  selector: 'app-reservas',
  imports: [Reserva, ReservaPago],
  templateUrl: './reservas.html',
  styleUrl: './reservas.css',
})
export class Reservas {
  readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'nueva', titulo: 'Nueva' },
    { id: 'pago', titulo: 'Con pago' },
    { id: 'editar', titulo: 'Editar' },
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
