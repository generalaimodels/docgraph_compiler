type LabelSet = Record<string, string | number | boolean | undefined>;

export interface CounterRecord {
  key: string;
  value: number;
}

export interface HistogramRecord {
  key: string;
  count: number;
  sum: number;
}

function formatKey(name: string, labels?: LabelSet): string {
  if (!labels) {
    return name;
  }

  return `${name}:${JSON.stringify(labels)}`;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, CounterRecord>();
  private readonly histograms = new Map<string, HistogramRecord>();

  increment(name: string, labels?: LabelSet, delta = 1): void {
    const key = formatKey(name, labels);
    const current = this.counters.get(key);
    if (!current) {
      this.counters.set(key, { key, value: delta });
      return;
    }

    current.value += delta;
  }

  histogram(name: string, value: number, labels?: LabelSet): void {
    const key = formatKey(name, labels);
    const current = this.histograms.get(key);
    if (!current) {
      this.histograms.set(key, { key, count: 1, sum: value });
      return;
    }

    current.count += 1;
    current.sum += value;
  }

  snapshot(): {
    counters: CounterRecord[];
    histograms: HistogramRecord[];
  } {
    return {
      counters: [...this.counters.values()],
      histograms: [...this.histograms.values()]
    };
  }
}
