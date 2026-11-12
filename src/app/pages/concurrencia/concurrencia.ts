import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, switchMap, tap, timer } from 'rxjs';
import { PlsqlService, PruebaConcurrencia, ReservaCruzada, ResultadoSesion, leerErrorPlsql } from '../../core/plsql';

interface Cliente {
  letra: 'A' | 'B';
  idCliente: number;
  resultado: ResultadoSesion | null;
}

/** El cliente B llega un poco después para que A siempre tome la habitación primero. */
const RETRASO_B_MS = 300;
/** Tiempo que cada reserva tarda en confirmarse, para que las dos coincidan. */
const SEGUNDOS_PROCESO = 5;

/**
 * Dos clientes reservan la misma habitación al mismo tiempo.
 * Sin protección: sp_reservar_sin_bloqueo. Con protección: sp_reservar_con_bloqueo (SELECT ... FOR UPDATE).
 */
@Component({
  selector: 'app-concurrencia',
  imports: [FormsModule],
  templateUrl: './concurrencia.html',
  styleUrl: './concurrencia.css',
})
export class Concurrencia implements OnDestroy {
  private api = inject(PlsqlService);

  idHabitacion = 5;
  fechaIn = '2027-04-10';
  fechaOut = '2027-04-13';
  proteccion = signal(true);

  corriendo = signal(false);
  /** Protección con la que se hizo la última simulación. */
  conProteccion = signal(true);
  clientes = signal<Cliente[]>([
    { letra: 'A', idCliente: 1, resultado: null },
    { letra: 'B', idCliente: 2, resultado: null },
  ]);
  reservas = signal<ReservaCruzada[] | null>(null);
  error = signal<string | null>(null);
  verDetalles = signal(false);
  ahora = signal(Date.now());
  private inicio = 0;
  private reloj?: ReturnType<typeof setInterval>;

  /** Escala de la línea de tiempo (detalles técnicos). */
  escala = computed(() => {
    const res = this.clientes().map((c) => c.resultado).filter((r): r is ResultadoSesion => !!r);
    if (res.length < 2) return null;
    const inicio = Math.min(...res.map((r) => r.inicioMs));
    const fin = Math.max(...res.map((r) => r.finMs));
    return { inicio, total: Math.max(fin - inicio, 1) };
  });

  simular(): void {
    if (!this.idHabitacion || !this.fechaIn || !this.fechaOut) {
      this.error.set('Escribe la habitación y las dos fechas.');
      return;
    }
    const con = this.proteccion();
    this.conProteccion.set(con);
    this.corriendo.set(true);
    this.reservas.set(null);
    this.error.set(null);
    this.clientes.update((l) => l.map((c) => ({ ...c, resultado: null })));

    const datos = (idCliente: number): PruebaConcurrencia => ({
      conBloqueo: con,
      idCliente,
      idHabitacion: this.idHabitacion,
      fechaIn: this.fechaIn,
      fechaOut: this.fechaOut,
      numeroPersonas: 1,
      segundosEspera: SEGUNDOS_PROCESO,
    });

    // Borra la simulación anterior, lanza los dos clientes y cuenta las reservas que quedaron
    this.api.limpiarConcurrencia(this.idHabitacion, this.fechaIn, this.fechaOut).pipe(
      switchMap(() => {
        this.inicio = Date.now();
        this.iniciarReloj();
        return forkJoin([
          this.lanzar('A', datos(1)),
          timer(RETRASO_B_MS).pipe(switchMap(() => this.lanzar('B', datos(2)))),
        ]);
      }),
      switchMap(() => this.api.reservasCruzadas(this.idHabitacion, this.fechaIn, this.fechaOut)),
    ).subscribe({
      next: (lista) => {
        this.reservas.set(lista);
        this.terminar();
      },
      error: (err: HttpErrorResponse) => {
        const e = leerErrorPlsql(err);
        this.error.set(`${e.titulo}. ${e.mensaje}`);
        this.terminar();
      },
    });
  }

  /** Texto y estilo de la tarjeta de cada cliente. */
  estado(c: Cliente): { texto: string; detalle: string; clase: string } {
    const r = c.resultado;
    if (!r) {
      if (!this.corriendo()) return { texto: 'Listo para reservar', detalle: '', clase: '' };
      return { texto: 'Reservando…', detalle: this.seg(this.transcurrido(c)), clase: 'curso' };
    }
    if (r.ok) return { texto: 'Reserva confirmada', detalle: `N.º ${r.idReserva}`, clase: 'ok' };
    const espera = this.esperaBloqueo(c);
    return {
      texto: 'Habitación no disponible',
      detalle: espera > 0 ? `Esperó ${this.seg(espera)} su turno` : 'Otro cliente la reservó primero',
      clase: 'rechazo',
    };
  }

  private transcurrido(c: Cliente): number {
    return Math.max(0, this.ahora() - this.inicio - (c.letra === 'B' ? RETRASO_B_MS : 0));
  }

  /** Tiempo que el cliente estuvo esperando a que el otro terminara (solo con protección). */
  esperaBloqueo(c: Cliente): number {
    const r = c.resultado;
    if (!r || !this.conProteccion()) return 0;
    if (r.ok) return r.msBloqueo ?? 0;
    const otra = this.clientes().find((x) => x.letra !== c.letra)?.resultado;
    return otra ? Math.min(r.finMs - r.inicioMs, Math.max(0, otra.finMs - r.inicioMs)) : 0;
  }

  tramos(c: Cliente): { desde: number; espera: number; trabajo: number } | null {
    const e = this.escala();
    const r = c.resultado;
    if (!e || !r) return null;
    const espera = this.esperaBloqueo(c);
    return {
      desde: ((r.inicioMs - e.inicio) / e.total) * 100,
      espera: (espera / e.total) * 100,
      trabajo: ((r.finMs - r.inicioMs - espera) / e.total) * 100,
    };
  }

  seg(ms: number): string {
    return (ms / 1000).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
  }

  ngOnDestroy(): void {
    clearInterval(this.reloj);
  }

  private lanzar(letra: 'A' | 'B', datos: PruebaConcurrencia) {
    return this.api.reservaConcurrente(datos).pipe(
      tap((r) => this.clientes.update((l) => l.map((c) => (c.letra === letra ? { ...c, resultado: r } : c)))),
    );
  }

  private iniciarReloj(): void {
    clearInterval(this.reloj);
    this.reloj = setInterval(() => this.ahora.set(Date.now()), 100);
  }

  private terminar(): void {
    clearInterval(this.reloj);
    this.corriendo.set(false);
  }
}
