import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_URL } from './api.config';

export interface LoginRequest {
  correo: string;
  contrasena: string;
}

export interface LoginResponse {
  mensaje: string;
  id: number;
  nombre: string;
  correo: string;
}

const STORAGE_KEY = 'turismouq_usuario';


@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly usuario = signal<LoginResponse | null>(this.leerUsuario());

  login(datos: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/auth/login`, datos).pipe(
      tap((usuario) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(usuario));
        this.usuario.set(usuario);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.usuario.set(null);
  }

  private leerUsuario(): LoginResponse | null {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  }
}
