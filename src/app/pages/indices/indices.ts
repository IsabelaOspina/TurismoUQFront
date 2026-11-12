import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CasoIndice, ComparacionIndice, MedicionIndice, PasoPlan, PlsqlService, leerErrorPlsql } from '../../core/plsql';

interface EstadoCaso {
  procesando: boolean;
  resultado: ComparacionIndice | null;
  error: string | null;
}

/** Nombre y descripción para el usuario de cada consulta (por id). */
const TEXTOS: Record<number, { nombre: string; descripcion: string }> = {
  1: { nombre: 'Reservas que llegan en un día', descripcion: 'Cuántas reservas llegan en una fecha, por estado.' },
  2: { nombre: 'Buscar cliente por correo', descripcion: 'Encuentra al cliente aunque el correo se escriba con otras mayúsculas.' },
  3: { nombre: 'Pagos recibidos en un día', descripcion: 'Cuántos pagos entraron en una fecha y cuánto suman.' },
  4: { nombre: 'Reservas finalizadas', descripcion: 'Total de reservas terminadas y sus ingresos.' },
};

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Velocidad de cada consulta sin y con su índice; el plan de ejecución queda en los detalles. */
@Component({
  selector: 'app-indices',
  templateUrl: './indices.html',
  styleUrl: './indices.css',
})
export class Indices implements OnInit {
  private api = inject(PlsqlService);

  casos = signal<CasoIndice[]>([]);
  cargando = signal(true);
  errorCarga = signal<string | null>(null);
  estados = signal<Record<number, EstadoCaso>>({});
  abierto = signal<number | null>(null);

  /** Resumen: cuántas consultas mejoraron y la mejora promedio. */
  resumen = computed(() => {
    const est = this.estados();
    const medidos = this.casos().filter((c) => est[c.id]?.resultado);
    if (!medidos.length) return null;
    const veces = medidos.map((c) => this.veces(est[c.id].resultado!)).filter((v) => v >= 1.1);
    return {
      mejoradas: veces.length,
      total: medidos.length,
      promedio: veces.length ? veces.reduce((a, b) => a + b, 0) / veces.length : null,
    };
  });

  ngOnInit(): void {
    this.api.casosIndices().subscribe({
      next: (lista) => {
        this.casos.set(lista);
        this.cargando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        const e = leerErrorPlsql(err);
        this.errorCarga.set(`${e.titulo}. ${e.mensaje}`);
        this.cargando.set(false);
      },
    });
  }

  texto(c: CasoIndice): { nombre: string; descripcion: string } {
    return TEXTOS[c.id] ?? { nombre: c.titulo, descripcion: '' };
  }

  estado(id: number): EstadoCaso {
    return this.estados()[id] ?? { procesando: false, resultado: null, error: null };
  }

  hayProcesando(): boolean {
    return Object.values(this.estados()).some((e) => e.procesando);
  }

  /** Mide las consultas una tras otra. */
  medir(): void {
    this.abierto.set(null);
    const lista = this.casos();
    const siguiente = (i: number) => {
      if (i < lista.length) this.comparar(lista[i], () => siguiente(i + 1));
    };
    siguiente(0);
  }

  alternar(id: number): void {
    this.abierto.set(this.abierto() === id ? null : id);
  }

  /** Cuántas veces más rápida es con el índice (por tiempo promedio). */
  veces(r: ComparacionIndice): number {
    const con = r.conIndice.msPromedio;
    return con > 0 ? r.sinIndice.msPromedio / con : 1;
  }

  mejora(c: CasoIndice, r: ComparacionIndice): string {
    const v = this.veces(r);
    if (!c.ayuda || v < 1.1) return 'Sin mejora';
    return `${this.redondo(v)}× más rápida`;
  }

  /** Ancho (%) de las barras de tiempo, relativo a la más lenta. */
  ancho(r: ComparacionIndice, ms: number): number {
    const max = Math.max(r.sinIndice.msPromedio, r.conIndice.msPromedio, 0.0001);
    return Math.max(2, (ms / max) * 100);
  }

  planes(r: ComparacionIndice): { titulo: string; m: MedicionIndice }[] {
    const p = [
      { titulo: 'Sin índice', m: r.sinIndice },
      { titulo: 'Con índice', m: r.conIndice },
    ];
    if (r.forzado) p.push({ titulo: 'Forzando el índice', m: r.forzado });
    return p;
  }

  clasePaso(p: PasoPlan): string {
    if (p.operacion.startsWith('TABLE ACCESS FULL')) return 'completo';
    if (p.operacion.startsWith('INDEX')) return 'indice';
    return '';
  }

  redondo(n: number): string {
    return n >= 10 ? String(Math.round(n)) : numero.format(Math.round(n * 10) / 10);
  }

  ms(n: number): string {
    return `${numero.format(n)} ms`;
  }

  num(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : numero.format(n);
  }

  private comparar(caso: CasoIndice, despues: () => void): void {
    this.cambiar(caso.id, { procesando: true, resultado: null, error: null });
    this.api.compararIndice(caso.id).subscribe({
      next: (r) => {
        this.cambiar(caso.id, { procesando: false, resultado: r, error: null });
        despues();
      },
      error: (err: HttpErrorResponse) => {
        const e = leerErrorPlsql(err);
        this.cambiar(caso.id, { procesando: false, resultado: null, error: `${e.titulo}. ${e.mensaje}` });
        despues();
      },
    });
  }

  private cambiar(id: number, estado: EstadoCaso): void {
    this.estados.update((e) => ({ ...e, [id]: estado }));
  }
}
