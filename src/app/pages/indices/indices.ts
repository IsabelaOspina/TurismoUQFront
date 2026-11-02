import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CasoIndice, ComparacionIndice, MedicionIndice, PasoPlan, PlsqlService, leerErrorPlsql } from '../../core/plsql';

interface EstadoCaso {
  procesando: boolean;
  resultado: ComparacionIndice | null;
  error: string | null;
}

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Compara cada consulta sin y con su índice: costo, tiempo y plan de ejecución. */
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

  /** Indicadores del encabezado. */
  resumen = computed(() => {
    const est = this.estados();
    const utiles = this.casos().filter((c) => c.ayuda);
    const medidos = utiles.map((c) => est[c.id]?.resultado).filter((r): r is ComparacionIndice => !!r);
    const reducciones = medidos
      .map((r) => this.cambio(r.sinIndice.costo, r.conIndice.costo))
      .filter((x): x is number => x !== null);
    return {
      total: utiles.length,
      optimizadas: medidos.length ? medidos.filter((r) => (r.conIndice.costo ?? 0) < (r.sinIndice.costo ?? 0)).length : null,
      reduccion: reducciones.length ? Math.round(reducciones.reduce((a, b) => a + b, 0) / reducciones.length) : null,
      descartados: this.casos().filter((c) => !c.ayuda && est[c.id]?.resultado).length || null,
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

  estado(id: number): EstadoCaso {
    return this.estados()[id] ?? { procesando: false, resultado: null, error: null };
  }

  hayProcesando(): boolean {
    return Object.values(this.estados()).some((e) => e.procesando);
  }

  /** Mide las consultas una tras otra. */
  analizar(): void {
    const lista = this.casos();
    const siguiente = (i: number) => {
      if (i < lista.length) this.comparar(lista[i], () => siguiente(i + 1));
    };
    siguiente(0);
  }

  alternar(id: number): void {
    this.abierto.set(this.abierto() === id ? null : id);
  }

  planes(r: ComparacionIndice): { titulo: string; m: MedicionIndice }[] {
    const p = [
      { titulo: 'Sin índice', m: r.sinIndice },
      { titulo: 'Con índice', m: r.conIndice },
    ];
    if (r.forzado) p.push({ titulo: 'Forzando el índice', m: r.forzado });
    return p;
  }

  /** Variación porcentual de a hacia b. */
  cambio(a: number | null, b: number | null): number | null {
    return a && b !== null ? Math.round(((b - a) / a) * 100) : null;
  }

  clasePaso(p: PasoPlan): string {
    if (p.operacion.startsWith('TABLE ACCESS FULL')) return 'completo';
    if (p.operacion.startsWith('INDEX')) return 'indice';
    return '';
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
