import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ErrorPlsql, leerErrorPlsql } from '../../core/plsql';
import { API_URL } from '../../core/api.config';

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

interface PagoReserva {
  idPago: number;
  fecha: string;
  valor: number;
  metodoPago: string;
  confirmado: 'SI' | 'NO';
  fechaLimite: string;
  enPlazo: 'SI' | 'NO';
}

interface DetalleReserva {
  idReserva: number;
  estado: string;
  fechaEntrada: string;
  fechaSalida: string;
  valorTotal: number;
  cliente: string;
  pagos: PagoReserva[];
}

interface ResultadoCancelacion {
  valorDevuelto: number;
  valorRetenido: number;
}

/** Cancelación de una reserva (PKG_TURISMO_UQ.sp_cancelar_reserva). */
@Component({
  selector: 'app-cancelar-reserva',
  imports: [FormsModule],
  templateUrl: './cancelar-reserva.html',
  styleUrl: './cancelar-reserva.css',
})
export class CancelarReserva {
  private http = inject(HttpClient);

  idReserva: number | null = null;
  detalle = signal<DetalleReserva | null>(null);
  procesando = signal<'' | 'buscar' | 'cancelar'>('');
  confirmando = signal(false);
  error = signal<ErrorPlsql | null>(null);
  resultado = signal<ResultadoCancelacion | null>(null);

  /** Solo pagos confirmados: los que se devolverían y los que no. */
  devolucion = computed(() => {
    const pagos = (this.detalle()?.pagos ?? []).filter((p) => p.confirmado === 'SI');
    const suma = (lista: PagoReserva[]) => lista.reduce((t, p) => t + Number(p.valor), 0);
    return {
      seDevuelve: suma(pagos.filter((p) => p.enPlazo === 'SI')),
      noSeDevuelve: suma(pagos.filter((p) => p.enPlazo === 'NO')),
    };
  });

  cancelable = computed(() => ['PENDIENTE', 'CONFIRMADA'].includes(this.detalle()?.estado ?? ''));

  buscar(): void {
    const id = Number(this.idReserva);
    this.resultado.set(null);
    this.confirmando.set(false);
    if (!id) {
      this.error.set({ codigo: '', titulo: 'Falta el número', mensaje: 'Escribe el número de la reserva.' });
      return;
    }
    this.cargar(id);
  }

  private cargar(id: number): void {
    this.error.set(null);
    this.procesando.set('buscar');
    this.http.get<DetalleReserva>(`${API_URL}/cancelacion/${id}`).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.procesando.set('');
      },
      error: (err: HttpErrorResponse) => {
        this.detalle.set(null);
        this.fallo(err);
      },
    });
  }

  cancelar(): void {
    const d = this.detalle();
    if (!d) return;
    this.error.set(null);
    this.procesando.set('cancelar');
    this.http.post<ResultadoCancelacion>(`${API_URL}/cancelacion/${d.idReserva}`, {}).subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.confirmando.set(false);
        this.cargar(d.idReserva);
      },
      error: (err: HttpErrorResponse) => {
        this.confirmando.set(false);
        this.fallo(err);
      },
    });
  }

  estadoPago(p: PagoReserva): { texto: string; clase: string } {
    if (p.confirmado === 'NO') return { texto: 'Devuelto', clase: 'neutro' };
    if (this.detalle()?.estado === 'CANCELADA') return { texto: 'No devuelto', clase: 'mal' };
    return p.enPlazo === 'SI'
      ? { texto: 'Se devuelve', clase: 'bien' }
      : { texto: 'No se devuelve', clase: 'mal' };
  }

  moneda(n: number): string {
    return dinero.format(Number(n));
  }

  /** "2026-11-18" → "18 nov 2026" */
  fecha(valor: string | null): string {
    if (!valor) return '—';
    const [a, m, d] = valor.split('-').map(Number);
    const mes = new Date(a, m - 1, d).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    return `${d} ${mes} ${a}`;
  }

  nombreEstado(e: string): string {
    return e.charAt(0) + e.slice(1).toLowerCase();
  }

  nombreMetodo(m: string): string {
    return m.charAt(0) + m.slice(1).toLowerCase();
  }

  private fallo(err: HttpErrorResponse): void {
    this.procesando.set('');
    this.error.set(leerErrorPlsql(err));
  }
}
