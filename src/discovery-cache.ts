export class CMTokenDiscoveryCache {
  private data: any | null = null;
  private timestamp: number = 0;
  private readonly ttl: number = 5 * 60 * 1000; // 5 minutes

  get(): any | null {
    if (this.data && Date.now() - this.timestamp < this.ttl) {
      return this.data;
    }
    return null;
  }

  set(data: any): void {
    this.data = data;
    this.timestamp = Date.now();
  }
}
