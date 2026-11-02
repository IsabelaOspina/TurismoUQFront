import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ErrorPlsql,
  PlsqlService,
  ReservaConPago,
  ResultadoReservaPago,
  ServicioAlojamiento,
  leerErrorPlsql,
} from '../../core/plsql';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/**
 * Reserva, servicio adicional y pago en una sola transacción
 * (PKG_TURISMO_UQ.sp_reservar_y_pagar). Si falla el servicio solo se revierte
 * el servicio (rollback parcial al SAVEPOINT); si falla el pago se revierte todo.
 */
@Component({
  selector: 'app-reserva-pago',
  imports: [FormsModule],
  templateUrl: './reserva-pago.html',
  styleUrls: ['../reserva/reserva.css', './reserva-pago.css'],
})
export class ReservaPago {
  private api = inject(PlsqlService);

  readonly metodos: ReservaConPago['metodoPago'][] = ['TARJETA', 'EFECTIVO', 'TRANSFERENCIA', 'PSE'];

  datos: ReservaConPago = {
    idCliente: 1,
    idHabitacion: 2,
    fechaIn: '2026-12-20',
    fechaOut: '2026-12-23',
    numeroPersonas: 2,
    valorPago: null,
    metodoPago: 'TARJETA',
    idServicio: null,
    cantidadServicio: 1,
  };

  servicios = signal<ServicioAlojamiento[]>([]);
  /** Valor de la estadía (fn_valor_estadia). */
  precio = signal<number | null>(null);
  procesando = signal<'' | 'precio' | 'confirmar'>('');
  resultado = signal<ResultadoReservaPago | null>(null);
  /** Error que revirtió toda la transacción. */
  error = signal<ErrorPlsql | null>(null);
  /** Copia de lo enviado, para mostrar el resumen de la transacción. */
  enviado = signal<ReservaConPago | null>(null);
  cargandoServicios = signal(false);
  private esperaServicios?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargarServicios();
  }

  /** Servicio elegido en el formulario. */
  servicioActual(): ServicioAlojamiento | null {
    const id = Number(this.datos.idServicio);
    return id ? this.servicios().find((s) => s.idServicio === id) ?? null : null;
  }

  /** La base de datos acepta de 1 a 10 unidades por servicio. */
  cantidadValida(): boolean {
    const c = Number(this.datos.cantidadServicio);
    return Number.isInteger(c) && c >= 1 && c <= 10;
  }

  /** Subtotal del servicio elegido (precio × cantidad); 0 si la cantidad no es válida. */
  subtotalServicio(): number {
    const s = this.servicioActual();
    return s && this.cantidadValida() ? Number(s.precio) * Number(this.datos.cantidadServicio) : 0;
  }

  /** Valor de la reserva = estadía + servicio. */
  totalReserva(): number | null {
    const p = this.precio();
    return p === null ? null : p + this.subtotalServicio();
  }

  /** Servicio que se envió (para la línea de tiempo de la transacción). */
  servicioEnviado = computed(() => {
    const e = this.enviado();
    return e?.idServicio ? this.servicios().find((s) => s.idServicio === Number(e.idServicio)) ?? null : null;
  });

  subtotalEnviado(): number {
    const s = this.servicioEnviado();
    const c = Number(this.enviado()?.cantidadServicio);
    return s && c > 0 ? Number(s.precio) * c : 0;
  }

  calcularPrecio(): void {
    const d = this.datos;
    if (!d.idHabitacion || !d.fechaIn || !d.fechaOut) {
      this.error.set({ codigo: '', titulo: 'Faltan datos', mensaje: 'Escribe la habitación y las dos fechas.' });
      return;
    }
    this.limpiar();
    this.procesando.set('precio');
    this.api.valorEstadia(d.idHabitacion, d.fechaIn, d.fechaOut).subscribe({
      next: ({ valor }) => {
        this.precio.set(Number(valor));
        this.actualizarPago();
        this.procesando.set('');
      },
      error: (err: HttpErrorResponse) => this.fallo(err),
    });
  }

  /** Al cambiar el servicio o la cantidad, el pago sugerido pasa a ser el nuevo total. */
  cambioServicio(): void {
    this.actualizarPago();
    this.limpiar();
  }

  confirmar(): void {
    const d = this.datos;
    if (!d.idCliente || !d.idHabitacion || !d.fechaIn || !d.fechaOut || !d.numeroPersonas || !d.valorPago) {
      this.error.set({ codigo: '', titulo: 'Faltan datos', mensaje: 'Completa cliente, habitación, fechas, personas y valor del pago.' });
      return;
    }
    this.limpiar();
    this.procesando.set('confirmar');
    const envio: ReservaConPago = {
      ...d,
      idServicio: d.idServicio ? Number(d.idServicio) : null,
      cantidadServicio: d.idServicio ? d.cantidadServicio : null,
    };
    this.enviado.set(envio);
    this.api.reservarYPagar(envio).subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.procesando.set('');
      },
      error: (err: HttpErrorResponse) => this.fallo(err),
    });
  }

  /** Al cambiar la habitación se cargan los servicios de su alojamiento y el precio deja de aplicar. */
  cambioHabitacion(): void {
    this.precio.set(null);
    this.limpiar();
    clearTimeout(this.esperaServicios);
    // Espera a que se termine de escribir el número antes de consultar
    this.esperaServicios = setTimeout(() => this.cargarServicios(), 350);
  }

  /** Al cambiar las fechas el precio deja de aplicar; los servicios siguen siendo los mismos. */
  cambioFechas(): void {
    this.precio.set(null);
    this.limpiar();
  }

  private cargarServicios(): void {
    const id = Number(this.datos.idHabitacion);
    if (!id) {
      this.servicios.set([]);
      this.datos.idServicio = null;
      return;
    }
    this.cargandoServicios.set(true);
    this.api.serviciosDeHabitacion(id).subscribe({
      next: (lista) => {
        this.cargandoServicios.set(false);
        this.servicios.set(lista);
        if (!lista.some((s) => s.idServicio === Number(this.datos.idServicio))) this.datos.idServicio = null;
      },
      error: () => {
        this.cargandoServicios.set(false);
        this.servicios.set([]);
        this.datos.idServicio = null;
      },
    });
  }

  nueva(): void {
    this.limpiar();
    this.enviado.set(null);
  }

  /** Saldo pendiente: con el valor final si ya se registró, si no con el total calculado. */
  saldo(): number | null {
    const r = this.resultado();
    const total = r ? Number(r.valorTotal) : this.totalReserva();
    const pago = r ? Number(this.enviado()?.valorPago) : Number(this.datos.valorPago);
    return total === null || !pago ? null : total - pago;
  }

  noches(): number {
    const a = Date.parse(this.datos.fechaIn);
    const b = Date.parse(this.datos.fechaOut);
    return isNaN(a) || isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 86400000));
  }

  moneda(n: number): string {
    return dinero.format(Number(n));
  }

  nombreMetodo(m: string): string {
    return m.charAt(0) + m.slice(1).toLowerCase();
  }

  private actualizarPago(): void {
    const t = this.totalReserva();
    if (t !== null) this.datos.valorPago = t;
  }

  private limpiar(): void {
    this.resultado.set(null);
    this.error.set(null);
  }

  private fallo(err: HttpErrorResponse): void {
    this.procesando.set('');
    this.error.set(leerErrorPlsql(err));
  }
}
