import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CasoIndice, ComparacionIndice, MedicionIndice, PasoPlan, PlsqlService, ResultadoConsulta, leerErrorPlsql,
} from '../../core/plsql';

interface EstadoCaso {
  consultando: boolean;
  consulta: ResultadoConsulta | null;
  error: string | null;
  midiendo: boolean;
  comparacion: ComparacionIndice | null;
  errorComparacion: string | null;
}

const VACIO: EstadoCaso = {
  consultando: false, consulta: null, error: null, midiendo: false, comparacion: null, errorComparacion: null,
};

/** Nombre y descripción para el usuario de cada consulta (por id). */
const TEXTOS: Record<number, { nombre: string; descripcion: string }> = {
  1: { nombre: 'Reservas que llegan en un día', descripcion: 'Cuántas reservas llegan en la fecha elegida, por estado.' },
  2: { nombre: 'Buscar cliente por correo', descripcion: 'Encuentra al cliente aunque el correo se escriba con otras mayúsculas.' },
  3: { nombre: 'Pagos recibidos en un día', descripcion: 'Cuántos pagos entraron en la fecha elegida y cuánto suman.' },
  4: { nombre: 'Pagos por método', descripcion: 'Cuántos pagos se hicieron con el método elegido y cuánto suman.' },
};

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/**
 * Consultas frecuentes: se hacen con el dato que escribe el usuario.
 * En los detalles técnicos se compara la consulta sin y con su índice (plan y tiempo).
 */
@Component({
  selector: 'app-indices',
  imports: [FormsModule],
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
  /** Dato escrito en cada tarjeta (por id). */
  valores: Record<number, string> = {};

  ngOnInit(): void {
    this.api.casosIndices().subscribe({
      next: (lista) => {
        lista.forEach((c) => (this.valores[c.id] = c.porDefecto));
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
    return this.estados()[id] ?? VACIO;
  }

  ocupado(): boolean {
    return Object.values(this.estados()).some((e) => e.consultando || e.midiendo);
  }

  /** Hace la consulta con el dato escrito. Los detalles anteriores dejan de valer. */
  consultar(c: CasoIndice): void {
    if (this.abierto() === c.id) this.abierto.set(null);
    this.cambiar(c.id, { ...VACIO, consultando: true });
    this.api.consultarIndice(c.id, this.valor(c)).subscribe({
      next: (r) => this.cambiar(c.id, { ...VACIO, consulta: r }),
      error: (err: HttpErrorResponse) => this.cambiar(c.id, { ...VACIO, error: this.textoError(err) }),
    });
  }

  consultarTodas(): void {
    this.casos().forEach((c) => this.consultar(c));
  }

  /** Abre los detalles; la primera vez compara la consulta sin y con índice. */
  alternar(c: CasoIndice): void {
    if (this.abierto() === c.id) {
      this.abierto.set(null);
      return;
    }
    this.abierto.set(c.id);
    const est = this.estado(c.id);
    if (!est.comparacion && !est.midiendo) this.comparar(c);
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
    if (this.mostrarForzado(r)) p.push({ titulo: 'Forzando el índice', m: r.forzado! });
    return p;
  }

  /** El plan forzado solo se muestra si es distinto del plan con índice. */
  mostrarForzado(r: ComparacionIndice): boolean {
    if (!r.forzado) return false;
    const pasos = (m: MedicionIndice) => m.plan.map((p) => `${p.operacion}|${p.objeto ?? ''}`).join(';');
    return pasos(r.forzado) !== pasos(r.conIndice) || r.forzado.costo !== r.conIndice.costo;
  }

  clasePaso(p: PasoPlan): string {
    if (p.operacion.startsWith('TABLE ACCESS FULL')) return 'completo';
    if (p.operacion.startsWith('INDEX')) return 'indice';
    return '';
  }

  nombreMetodo(m: string): string {
    return m.charAt(0) + m.slice(1).toLowerCase();
  }

  /** "fecha_entrada" → "Fecha entrada" */
  columna(nombre: string): string {
    const t = nombre.replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /** Columna numérica (se alinea a la derecha). */
  esNumero(d: { filas: (string | number | null)[][] }, i: number): boolean {
    return typeof d.filas[0]?.[i] === 'number';
  }

  /** Números con separador de miles, excepto los identificadores. */
  formato(v: string | number | null, columna: string): string {
    if (v === null) return '—';
    if (typeof v !== 'number' || columna.startsWith('id')) return String(v);
    return numero.format(v);
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

  private comparar(c: CasoIndice): void {
    this.cambiar(c.id, { ...this.estado(c.id), midiendo: true, errorComparacion: null });
    this.api.compararIndice(c.id, this.valor(c)).subscribe({
      next: (r) => this.cambiar(c.id, { ...this.estado(c.id), midiendo: false, comparacion: r }),
      error: (err: HttpErrorResponse) =>
        this.cambiar(c.id, { ...this.estado(c.id), midiendo: false, errorComparacion: this.textoError(err) }),
    });
  }

  private valor(c: CasoIndice): string {
    return this.valores[c.id] ?? c.porDefecto;
  }

  private textoError(err: HttpErrorResponse): string {
    const e = leerErrorPlsql(err);
    return `${e.titulo}. ${e.mensaje}`;
  }

  private cambiar(id: number, estado: EstadoCaso): void {
    this.estados.update((e) => ({ ...e, [id]: estado }));
  }
}
