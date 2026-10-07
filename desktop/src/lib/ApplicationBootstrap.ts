export interface ApplicationModule {
  mountApplication(ready: () => void, fail: (error: unknown) => void): void;
}

/** Owns the transition from the static document to a committed React tree. */
export class ApplicationBootstrap {
  state: 'loading' | 'ready' | 'failed' = 'loading';
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly showFailure: (error: unknown) => void;

  constructor(showFailure: (error: unknown) => void) {
    this.showFailure = showFailure;
  }

  async start(load: () => Promise<ApplicationModule>, timeoutMs = 20_000): Promise<void> {
    this.timer = setTimeout(() => this.fail(new Error('工作台启动超时，请重新加载。')), timeoutMs);
    try {
      const application = await load();
      if (this.state === 'loading') application.mountApplication(this.ready, this.fail);
    } catch (error) {
      this.fail(error);
    }
  }

  readonly ready = (): void => {
    if (this.state !== 'loading') return;
    clearTimeout(this.timer);
    this.state = 'ready';
  };

  readonly fail = (error: unknown): void => {
    if (this.state === 'failed') return;
    clearTimeout(this.timer);
    this.state = 'failed';
    this.showFailure(error);
  };
}
