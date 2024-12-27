import weaviate, { configure } from 'weaviate-client';
const { dataType, vectorizer } = configure;

/**
 * Extended CodeChunk class:
 * - Adds repo/commit/contentHash for precise referencing
 * - Replaces 'references' text array with:
 *   -- referenceSymbols: a TEXT_ARRAY of raw symbol/import references
 *   -- referenceChunks: cross-references to other CodeChunk objects
 */
const coraSchema = {
  class: 'CodeChunk',
  // Use OpenAI vectorizer for code
  vectorizer: 'text2vec-openai',
  // Optionally specify how the vector index calculates distance
  vectorIndexConfig: {
    distance: 'cosine',
  },
  // Properties define the shape of each chunk
  properties: [
    {
      name: 'content',
      dataType: [dataType.TEXT],
      description: 'Verbatim code content of the chunk',
      // Typically not filterable (large text), but definitely searchable
      indexSearchable: true,
    },
    {
      name: 'commentary',
      dataType: [dataType.TEXT],
      description: 'AI-generated commentary about the chunk',
      indexSearchable: true,
    },
    {
      name: 'filePath',
      dataType: [dataType.TEXT],
      description: 'Path to the source file',
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'repoId',
      dataType: [dataType.TEXT],
      description: 'An identifier for the repository this chunk comes from',
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'commitHash',
      dataType: [dataType.TEXT],
      description: 'Commit hash for the version of this file chunk',
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'contentHash',
      dataType: [dataType.TEXT],
      description: 'A hash of the file content (for deduplication)',
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'lineStart',
      dataType: [dataType.INT],
      description: 'Starting line number in the source file',
      indexFilterable: true,
    },
    {
      name: 'lineEnd',
      dataType: [dataType.INT],
      description: 'Ending line number in the source file',
      indexFilterable: true,
    },
    {
      name: 'language',
      dataType: [dataType.TEXT],
      description: 'Programming language of the chunk',
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'declarationType',
      dataType: [dataType.TEXT],
      description: 'High-level classification (function, class, etc.)',
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'referenceSymbols',
      dataType: [dataType.TEXT],
      description: 'Symbol-level references (imports, function calls, etc.)',
      // Keep text array for quick lexical queries
      indexFilterable: true,
      indexSearchable: true,
    },
    {
      name: 'referenceChunks',
      dataType: ['CodeChunk'],
      description: 'Cross-reference to other CodeChunks this chunk calls or depends on',
    },
  ],
  moduleConfig: {
    'text2vec-openai': {
      model: 'code-davinci-002',
      modelVersion: '002',
      type: 'code',
      // Optionally tweak the vectorization settings
      // e.g. temperature, maxTokens, etc. if your Weaviate instance supports them
    },
  },
};

// Creating the schema in Weaviate
export async function createCoraSchema(client: weaviate.Client) {
  try {
    // Drop existing class if you need a clean slate:
    // await client.schema.classDeleter().withClassName('CodeChunk').do();

    await client.schema
      .classCreator()
      .withClass(coraSchema as any) // cast if needed
      .do();

    console.log('CodeChunk schema created successfully.');
  } catch (err) {
    console.error('Error creating CodeChunk schema:', err);
    throw err;
  }
}
