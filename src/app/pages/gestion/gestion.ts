import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Reserva, ReservaInicial } from '../reserva/reserva';
import { Liquidacion } from '../liquidacion/liquidacion';
import { Auditoria } from '../auditoria/auditoria';

type Vista = 'reserva' | 'editar' | 'liquidacion' | 'auditoria';

/** Área de gestión: reservas, liquidación y auditoría de tarifas. */
@Component({
  selector: 'app-gestion',
  imports: [RouterLink, RouterLinkActive, Reserva, Liquidacion, Auditoria],
  templateUrl: './gestion.html',
  // Mismo diseño de menú lateral que las consultas
  styleUrls: ['../dashboard/dashboard.css', './gestion.css'],
})
export class Gestion {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly usuario = this.auth.usuario;

  readonly opciones: { id: Vista; titulo: string }[] = [
    { id: 'reserva', titulo: 'Nueva reserva' },
    { id: 'editar', titulo: 'Editar reserva' },
    { id: 'liquidacion', titulo: 'Liquidación' },
    { id: 'auditoria', titulo: 'Auditoría de tarifas' },
  ];

  vista = signal<Vista>('reserva');
  menuAbierto = signal(false);
  /** Reserva que se abre en "Editar reserva" (la recién creada), o null para empezar vacío. */
  reservaAEditar = signal<ReservaInicial | null>(null);

  abrir(vista: Vista): void {
    this.reservaAEditar.set(null);
    this.vista.set(vista);
    this.menuAbierto.set(false);
  }

  /** Desde "Nueva reserva": abre la reserva recién creada para modificarla. */
  editarCreada(reserva: ReservaInicial): void {
    this.reservaAEditar.set(reserva);
    this.vista.set('editar');
  }

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
