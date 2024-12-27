import weaviate, { configure } from 'weaviate-client';
const { dataType, vectorizer } = configure;

// Core types for the schema
type CodeChunk = {
  content: string;
  commentary: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  declarationType: string;
  references: string[];
};

// Schema creation
const coraSchema = {
  class: 'CodeChunk',
  vectorIndexConfig: {
    distance: 'cosine'
  },
  properties: [
    {
      name: 'content',
      dataType: dataType.TEXT,
      description: 'The actual code content of the chunk'
    },
    {
      name: 'commentary',
      dataType: dataType.TEXT,
      description: 'AI-generated documentation about the chunk'
    },
    {
      name: 'filePath',
      dataType: dataType.TEXT,
      description: 'Path to the source file',
      indexFilterable: true,
      indexSearchable: true
    },
    {
      name: 'lineStart',
      dataType: dataType.INT,
      description: 'Starting line number in source file',
      indexFilterable: true
    },
    {
      name: 'lineEnd',
      dataType: dataType.INT,
      description: 'Ending line number in source file',
      indexFilterable: true
    },
    {
      name: 'language',
      dataType: dataType.TEXT,
      description: 'Programming language of the chunk',
      indexFilterable: true,
      indexSearchable: true
    },
    {
      name: 'declarationType',
      dataType: dataType.TEXT,
      description: 'Type of declaration (function, class, etc)',
      indexFilterable: true,
      indexSearchable: true
    },
    {
      name: 'references',
      dataType: dataType.TEXT_ARRAY,
      description: 'References to other chunks',
      indexFilterable: true,
      indexSearchable: true
    }
  ],
  vectorizers: [
    vectorizer.text2VecOpenAI({
      name: 'code_vectorizer',
      sourceProperties: ['content', 'commentary']
    })
  ],
  moduleConfig: {
    'text2vec-openai': {
      model: 'code-davinci-002',
      modelVersion: '002',
      type: 'code'
    }
  }
};

// Schema creation function
async function createCoraSchema(client: weaviate.Client) {
  try {
    await client.collections.create(coraSchema);
    console.log('Schema created successfully');
  } catch (err) {
    console.error('Error creating schema:', err);
    throw err;
  }
}
