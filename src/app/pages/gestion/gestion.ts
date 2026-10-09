import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Reserva } from '../reserva/reserva';
import { Liquidacion } from '../liquidacion/liquidacion';

type Vista = 'reserva' | 'liquidacion';

/** Área de gestión de reservas: nueva reserva y liquidación mensual. */
@Component({
  selector: 'app-gestion',
  imports: [RouterLink, RouterLinkActive, Reserva, Liquidacion],
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
    { id: 'liquidacion', titulo: 'Liquidación mensual' },
  ];

  vista = signal<Vista>('reserva');
  menuAbierto = signal(false);

  abrir(vista: Vista): void {
    this.vista.set(vista);
    this.menuAbierto.set(false);
  }

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
