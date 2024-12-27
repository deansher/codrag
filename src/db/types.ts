export interface CodeChunk {
    content: string;
    commentary?: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    language: string;
    declarationType: string;
    references: string[];
  }
  
  export interface QueryRequest {
    messages: Array<{
      role: string;
      content: string;
    }>;
    approxLength: number;
    repos: Array<{
      originUri: string;
      checkoutPath?: string;
      versionSpecifier: string;
    }>;
    boostDirectives?: {
      files?: string[];
      declarations?: Array<{
        repoId: string;
        path: string;
        includeImplementation: boolean;
      }>;
    };
  }
  