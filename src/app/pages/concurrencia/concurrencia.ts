import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, switchMap, tap, timer } from 'rxjs';
import { PlsqlService, PruebaConcurrencia, ReservaCruzada, ResultadoSesion, leerErrorPlsql } from '../../core/plsql';

type Modo = 'sin' | 'con';

interface Sesion {
  nombre: 'A' | 'B';
  idCliente: number;
  resultado: ResultadoSesion | null;
}

/** La sesión B arranca un poco después para que la A siempre tome la habitación primero. */
const RETRASO_B_MS = 300;

/**
 * Experimento de concurrencia: dos sesiones intentan reservar la misma habitación
 * en las mismas fechas al mismo tiempo, sin bloqueo y con SELECT ... FOR UPDATE.
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
  segundos = 5;

  modo = signal<Modo | null>(null);
  corriendo = signal(false);
  sesiones = signal<Sesion[]>([]);
  reservas = signal<ReservaCruzada[] | null>(null);
  error = signal<string | null>(null);
  /** Hora actual, para mostrar los segundos que lleva cada sesión mientras corre. */
  ahora = signal(Date.now());
  private inicioPrueba = 0;
  private reloj?: ReturnType<typeof setInterval>;

  /** Escala de la línea de tiempo: del inicio de A al final de la última sesión. */
  escala = computed(() => {
    const res = this.sesiones().map((s) => s.resultado).filter((r): r is ResultadoSesion => !!r);
    if (res.length < 2) return null;
    const inicio = Math.min(...res.map((r) => r.inicioMs));
    const fin = Math.max(...res.map((r) => r.finMs));
    return { inicio, total: Math.max(fin - inicio, 1) };
  });

  ejecutar(modo: Modo): void {
    if (!this.idHabitacion || !this.fechaIn || !this.fechaOut) {
      this.error.set('Escribe la habitación y las dos fechas.');
      return;
    }
    this.modo.set(modo);
    this.corriendo.set(true);
    this.reservas.set(null);
    this.error.set(null);
    this.sesiones.set([
      { nombre: 'A', idCliente: 1, resultado: null },
      { nombre: 'B', idCliente: 2, resultado: null },
    ]);

    const datos = (idCliente: number): PruebaConcurrencia => ({
      conBloqueo: modo === 'con',
      idCliente,
      idHabitacion: this.idHabitacion,
      fechaIn: this.fechaIn,
      fechaOut: this.fechaOut,
      numeroPersonas: 1,
      segundosEspera: this.segundos,
    });

    // 1. Borrar las reservas de pruebas anteriores con esta habitación y fechas
    this.api.limpiarConcurrencia(this.idHabitacion, this.fechaIn, this.fechaOut).pipe(
      // 2. Lanzar las dos sesiones casi al mismo tiempo
      switchMap(() => {
        this.inicioPrueba = Date.now();
        this.iniciarReloj();
        return forkJoin([
          this.lanzar('A', datos(1)),
          timer(RETRASO_B_MS).pipe(switchMap(() => this.lanzar('B', datos(2)))),
        ]);
      }),
      // 3. Ver cuántas reservas quedaron ocupando la habitación
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

  /** Segundos transcurridos de una sesión (en vivo mientras corre). */
  segundosSesion(s: Sesion): string {
    if (s.resultado) return this.seg(s.resultado.finMs - s.resultado.inicioMs);
    const desde = this.inicioPrueba + (s.nombre === 'B' ? RETRASO_B_MS : 0);
    return this.seg(Math.max(0, this.ahora() - desde));
  }

  /**
   * Tiempo que la sesión estuvo detenida esperando el bloqueo.
   * Si fue rechazada, Oracle no alcanzó a devolverlo: es lo que tardó la otra sesión en confirmar.
   */
  esperaBloqueo(s: Sesion): number {
    const r = s.resultado;
    if (!r || this.modo() !== 'con') return 0;
    if (r.ok) return r.msBloqueo ?? 0;
    const otra = this.sesiones().find((x) => x.nombre !== s.nombre)?.resultado;
    return otra ? Math.min(r.finMs - r.inicioMs, Math.max(0, otra.finMs - r.inicioMs)) : 0;
  }

  /** Posición y tamaño (en %) de los tramos de la barra de una sesión. */
  tramos(s: Sesion): { desplazamiento: number; espera: number; trabajo: number } | null {
    const e = this.escala();
    const r = s.resultado;
    if (!e || !r) return null;
    const espera = this.esperaBloqueo(s);
    return {
      desplazamiento: ((r.inicioMs - e.inicio) / e.total) * 100,
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

  private lanzar(nombre: 'A' | 'B', datos: PruebaConcurrencia) {
    return this.api.reservaConcurrente(datos).pipe(
      tap((r) => {
        this.sesiones.update((lista) => lista.map((s) => (s.nombre === nombre ? { ...s, resultado: r } : s)));
      }),
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
