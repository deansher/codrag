import weaviate, { configure } from 'weaviate-client';
const { dataType, vectorizer } = configure;

const contentEntityDefinitionSchema = {
    class: 'ContentEntityDefinition',
    properties: [
      {
        name: 'identifier',
        dataType: ['text'],
        description: 'The name or heading of this entity (function name, class name, doc section, etc.)',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'entityType',
        dataType: ['text'],
        description: 'High-level type: function, class, markdownSection, etc.',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'fileVersion',
        dataType: ['FileVersion'],
        description: 'Reference to the specific FileVersion in which this definition appears',
      },
  
      // The defining side knows lines and file path
      {
        name: 'filePath',
        dataType: ['text'],
        description: 'The file path for this definition, typically redundant with fileVersion but convenient.',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'lineStart',
        dataType: ['int'],
        description: 'Line number where the definition starts',
        indexFilterable: true,
      },
      {
        name: 'lineEnd',
        dataType: ['int'],
        description: 'Line number where the definition ends',
        indexFilterable: true,
      },
      {
        name: 'definedInChunk',
        dataType: ['Chunk'],
        description: 'Optional reference to the chunk that physically contains the definition',
      },
  
      // Additional optional metadata
      // e.g., "modulePath", "namespace", "visibility" (public/private), "language", etc.
    ],
  };
  
  const contentEntityReferenceSchema = {
    class: 'ContentEntityReference',
    properties: [
      {
        name: 'identifierUsed',
        dataType: ['text'],
        description: 'The literal name or heading used in the referencing code or doc. E.g., "fooMethod".',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'referenceType',
        dataType: ['text'],
        description: 'call, import, link, reexport, mention, etc.',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'fileVersion',
        dataType: ['FileVersion'],
        description: 'The version of the file in which this reference occurs',
      },
  
      // The referencing side knows only its own location
      {
        name: 'filePath',
        dataType: ['text'],
        description: 'The referencing file path (optional if implied by fileVersion)',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'lineStart',
        dataType: ['int'],
        description: 'Line where this reference is used',
        indexFilterable: true,
      },
      {
        name: 'lineEnd',
        dataType: ['int'],
        description: 'Line range end for the usage',
        indexFilterable: true,
      },
      {
        name: 'appearsInChunk',
        dataType: ['Chunk'],
        description: 'Reference to the chunk containing this usage, if you want chunk-level linking',
      },
  
      // Other optional fields
      // e.g. "importPath" for an import statement, or "hyperlink" for doc references
    ],
  };

  const fileVersionSchema = {
    class: 'FileVersion',
    properties: [
      {
        name: 'repoId',
        dataType: [dataType.TEXT],
        description: 'Repository identifier',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'projectDir',
        dataType: [dataType.TEXT],
        description: 'Project directory path',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'filePath',
        dataType: [dataType.TEXT],
        description: 'Path to the file within the project',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'contentHash',
        dataType: [dataType.TEXT],
        description: 'Hash of the file content',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'chunks',
        dataType: ['Chunk'],
        description: 'Associated code chunks from this file version',
      }
    ]
  };
  
  const chunkSchema = {
  class: 'Chunk',
  namedVectors: {
    embed_formatted_voyage_c3: {
      vectorizer: 'none',
      dimension: 2048
    }
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
      name: 'repoId',
      dataType: [dataType.TEXT],
      description: 'An identifier for the repository this chunk comes from',
      indexFilterable: true,
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
      dataType: ['Chunk'],
      description: 'Cross-reference to other Chunks this chunk calls or depends on',
    },
    {
        name: 'fileVersion',
        dataType: ['FileVersion'],
        description: 'Reference to the FileVersion this chunk belongs to',
    }
],
};  

const commitFileVersionSchema = {
    class: 'CommitFileVersion',
    properties: [
      {
        name: 'commitHash',
        dataType: [dataType.TEXT],
        description: 'Git commit hash',
        indexFilterable: true,
        indexSearchable: true,
      },
      {
        name: 'fileVersion',
        dataType: ['FileVersion'],
        description: 'Reference to the associated FileVersion',
      },
      {
        name: 'timestamp',
        dataType: [dataType.DATE],
        description: 'Commit timestamp',
        indexFilterable: true,
      }
    ]
  };

  export async function createAllSchemas(client: weaviate.Client) {
    try {
      await client.schema
        .classCreator()
        .withClass(chunkSchema as any)
        .do();
      
      await client.schema
        .classCreator()
        .withClass(fileVersionSchema as any)
        .do();
        
      await client.schema
        .classCreator()
        .withClass(commitFileVersionSchema as any)
        .do();
  
      console.log('All schemas created successfully.');
    } catch (err) {
      console.error('Error creating schemas:', err);
      throw err;
    }
  }
