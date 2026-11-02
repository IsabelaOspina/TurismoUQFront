import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Liquidacion } from '../liquidacion/liquidacion';
import { Auditoria } from '../auditoria/auditoria';
import { Reservas } from '../reservas/reservas';

type Vista = 'reservas' | 'liquidacion' | 'auditoria';

/** Área de gestión: reservas, liquidación y auditoría de tarifas. */
@Component({
  selector: 'app-gestion',
  imports: [RouterLink, RouterLinkActive, Reservas, Liquidacion, Auditoria],
  templateUrl: './gestion.html',
  // Mismo diseño de menú lateral que las consultas
  styleUrls: ['../dashboard/dashboard.css', './gestion.css'],
})
export class Gestion {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly usuario = this.auth.usuario;

  readonly opciones: { id: Vista; titulo: string }[] = [
    { id: 'reservas', titulo: 'Reservas' },
    { id: 'liquidacion', titulo: 'Liquidación' },
    { id: 'auditoria', titulo: 'Auditoría de tarifas' },
  ];

  vista = signal<Vista>('reservas');
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
