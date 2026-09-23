import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  correo = '';
  contrasena = '';
  verContrasena = signal(false);
  cargando = signal(false);
  error = signal('');

  constructor() {
    if (this.auth.usuario()) this.router.navigate(['/consultas']);
  }

  ingresar(): void {
    if (!this.correo || !this.contrasena) {
      this.error.set('Ingresa tu correo y contraseña.');
      return;
    }
    this.error.set('');
    this.cargando.set(true);

    this.auth.login({ correo: this.correo.trim(), contrasena: this.contrasena }).subscribe({
      next: () => this.router.navigate(['/consultas']),
      error: (err: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(
          err.status === 0
            ? 'No se pudo conectar con el servidor. ¿Está corriendo el backend?'
            : 'Correo o contraseña incorrectos, o el usuario está inactivo.'
        );
      },
    });
  }
}
