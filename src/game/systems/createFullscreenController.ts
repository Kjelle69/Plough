interface FullscreenControllerOptions {
  element: HTMLElement;
}

export function createFullscreenController(options: FullscreenControllerOptions) {
  return {
    async toggle(): Promise<void> {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await options.element.requestFullscreen();
    },
  };
}
