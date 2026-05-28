declare global {
  interface Window {
    __MDROP_CONFIG__?: {
      apiKey?: string;
      apiServer?: string;
      initData?: string;
    };
  }
}

export {};