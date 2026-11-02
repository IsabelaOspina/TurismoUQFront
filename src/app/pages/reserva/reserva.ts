import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ErrorPlsql, NuevaReserva, PlsqlService, ReservaExistente, leerErrorPlsql } from '../../core/plsql';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export type ModoReserva = 'crear' | 'editar';

/** Datos con los que se abre la pantalla en modo editar (por ejemplo, tras crear una reserva). */
export interface ReservaInicial {
  idReserva: number;
  datos: NuevaReserva;
}

@Component({
  selector: 'app-reserva',
  imports: [FormsModule],
  templateUrl: './reserva.html',
  styleUrl: './reserva.css',
})
export class Reserva {
  private api = inject(PlsqlService);

  /** 'crear' usa sp_crear_reserva; 'editar' usa sp_editar_reserva. */
  modo = input<ModoReserva>('crear');
  inicial = input<ReservaInicial | null>(null);
  /** Se emite al pulsar "Modificar esta reserva" después de crearla. */
  modificar = output<ReservaInicial>();

  idReserva: number | null = null;

  datos: NuevaReserva = {
    idCliente: 1,
    idHabitacion: 1,
    fechaIn: '2026-12-10',
    fechaOut: '2026-12-14',
    numeroPersonas: 2,
  };

  procesando = signal<'' | 'precio' | 'confirmar' | 'buscar'>('');
  /** Reserva cargada con "Buscar" (estado y valor que tiene hoy en la base de datos). */
  cargada = signal<ReservaExistente | null>(null);
  /** Precio calculado para las fechas y la habitación actuales. */
  precio = signal<number | null>(null);
  creada = signal<{ idReserva: number; valor: number | null } | null>(null);
  error = signal<ErrorPlsql | null>(null);

  constructor() {
    // Si llega una reserva para editar, se cargan sus datos en el formulario
    effect(() => {
      const ini = this.inicial();
      if (ini) {
        this.idReserva = ini.idReserva;
        this.datos = { ...ini.datos };
      } else if (this.modo() === 'editar') {
        // Edición desde cero: el formulario empieza vacío
        this.idReserva = null;
        this.datos = { idCliente: null, idHabitacion: null, fechaIn: '', fechaOut: '', numeroPersonas: null };
      }
    });
  }

  esEdicion(): boolean {
    return this.modo() === 'editar';
  }

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
    if (this.esEdicion() && !this.idReserva) {
      this.creada.set(null);
      this.error.set({ codigo: '', titulo: 'Falta el número de reserva', mensaje: 'Escribe el número de la reserva que quieres modificar.' });
      return;
    }
    if (!this.validarCampos(['idCliente', 'idHabitacion', 'fechaIn', 'fechaOut', 'numeroPersonas'])) return;
    this.creada.set(null);
    this.error.set(null);
    this.procesando.set('confirmar');

    const peticion: Observable<{ idReserva: number }> = this.esEdicion()
      ? this.api.editarReserva(this.idReserva!, this.datos)
      : this.api.crearReserva(this.datos);

    peticion.subscribe({
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

  /** Carga en el formulario los datos actuales de la reserva escrita en "Número de reserva". */
  buscar(): void {
    if (!this.idReserva) {
      this.error.set({ codigo: '', titulo: 'Falta el número de reserva', mensaje: 'Escribe el número de la reserva que quieres buscar.' });
      return;
    }
    this.cambio();
    this.cargada.set(null);
    this.procesando.set('buscar');
    this.api.obtenerReserva(this.idReserva).subscribe({
      next: (r) => {
        this.procesando.set('');
        this.cargada.set(r);
        this.datos = {
          idCliente: r.idCliente,
          idHabitacion: r.idHabitacion,
          fechaIn: r.fechaEntrada,
          fechaOut: r.fechaSalida,
          numeroPersonas: r.numeroPersonas,
        };
        this.precio.set(r.valorTotal !== null ? Number(r.valorTotal) : null);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.procesando.set('');
          this.error.set({ codigo: '', titulo: 'Reserva no encontrada', mensaje: err.error?.error ?? `No existe la reserva N.º ${this.idReserva}.` });
        } else {
          this.fallo(err);
        }
      },
    });
  }

  /** Al cambiar el número de reserva, los datos cargados ya no corresponden. */
  cambioNumero(): void {
    this.cargada.set(null);
    this.cambio();
  }

  /** Abre la reserva recién creada en el modo editar. */
  modificarCreada(): void {
    const c = this.creada();
    if (c) this.modificar.emit({ idReserva: Number(c.idReserva), datos: { ...this.datos } });
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
