/**
 * Comprehensive verification script to test all components
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import generateSchema from './src/generator.js';
import ORMManager from './src/index.js';
import type { RelationDef } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('\n=== SLINTORM VERIFICATION SUITE ===\n');

// ============================================================================
// TEST 1: Generator - Tokenizer and Parser
// ============================================================================
console.log('TEST 1: Generator - Tokenization & Parsing');
console.log('-'.repeat(50));

try {
  // Create a simple test file
  const testInterfacesContent = `
// Test model
export interface TestUser {
  // @index;auto;comment:primary key
  id?: number;
  // @length:100;not null;comment:User name
  name: string;
  // @nullable;comment:User email
  email?: string;
  // @relation manyToOne:TestTeam;foreignKey:teamId
  team?: TestTeam;
  createdAt?: string;
  updatedAt?: string;
}

export interface TestTeam {
  // @index;auto
  id?: number;
  // @length:255;not null
  title: string;
  // @relationship oneToMany:TestUser;foreignKey:teamId
  members?: TestUser[];
  createdAt?: string;
  updatedAt?: string;
}
`;

  const srcDir = join(__dirname, 'src_test_verify');
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  fs.writeFileSync(join(srcDir, 'test-models.ts'), testInterfacesContent, 'utf8');
  console.log('✓ Created test models file');

  // Run generator
  const schema = await generateSchema(srcDir);
  console.log('✓ Schema generated successfully');
  
  // Verify schema structure
  const expectedModels = ['TestUser', 'TestTeam'];
  for (const modelName of expectedModels) {
    if (!schema[modelName]) {
      throw new Error(`Missing model: ${modelName}`);
    }
    console.log(`  ✓ Model "${modelName}" found with ${Object.keys(schema[modelName].fields).length} fields`);
  }

  // Verify relation parsing
  const userRels = schema['TestUser'].relations;
  if (userRels.length > 0) {
    console.log(`  ✓ Relations parsed: ${userRels.length} relation(s) in TestUser`);
   // @ts-ignore
    userRels.forEach((rel: RelationDef) => {
      console.log(`    - ${rel.fieldName}: ${rel.kind} with ${rel.targetModel}`);
    });
  }

  // Check generated files
  const genFile = join(srcDir, 'schema', 'generated.ts');
  const jsonFile = join(srcDir, 'schema', 'generated.json');
  if (!fs.existsSync(genFile) || !fs.existsSync(jsonFile)) {
    throw new Error('Generated schema files not created');
  }
  console.log('✓ Generated schema files created (generated.ts, generated.json)');

  // Cleanup
  fs.rmSync(srcDir, { recursive: true, force: true });
  console.log('✓ Cleanup complete\n');
} catch (err: any) {
  console.error('✗ TEST 1 FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// ============================================================================
// TEST 2: ORM Manager - SQLite Database
// ============================================================================
console.log('TEST 2: ORM Manager - SQLite Operations');
console.log('-'.repeat(50));

try {
  const dbFile = join(__dirname, 'verify-test.db');
  
  // Clean up old database
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
  }

  // Create ORM instance
  const orm = new ORMManager({
    driver: 'sqlite',
    databaseUrl: dbFile,
    dir: 'src',
    logs: false,
  });

  console.log('✓ ORM Manager instance created');

  // Run migrations
  await orm.migrate();
  console.log('✓ Database migrations completed');

  // Verify database file was created
  if (!fs.existsSync(dbFile)) {
    throw new Error('Database file not created');
  }
  console.log(`✓ Database file created: ${dbFile}`);

  // Cleanup
  fs.unlinkSync(dbFile);
  console.log('✓ Database cleanup complete\n');
} catch (err: any) {
  console.error('✗ TEST 2 FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// ============================================================================
// TEST 3: Verify generated.json schema
// ============================================================================
console.log('TEST 3: Verify Generated Schema File');
console.log('-'.repeat(50));

try {
  const schemaJsonFile = join(__dirname, 'src', 'schema', 'generated.json');
  
  if (!fs.existsSync(schemaJsonFile)) {
    throw new Error(`Schema file not found: ${schemaJsonFile}`);
  }

  const schemaContent = fs.readFileSync(schemaJsonFile, 'utf8');
  const schema = JSON.parse(schemaContent);
  
  console.log('✓ Schema JSON file exists and is valid JSON');

  const modelCount = Object.keys(schema).length;
  console.log(`✓ Schema contains ${modelCount} models`);

  // List all models
  console.log('  Models found:');
  for (const [modelName, modelDef] of Object.entries(schema) as any) {
    const fieldCount = Object.keys(modelDef.fields).length;
    const relationCount = modelDef.relations?.length || 0;
    console.log(`    - ${modelName}: ${fieldCount} fields, ${relationCount} relations`);
  }

  console.log();
} catch (err: any) {
  console.error('✗ TEST 3 FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('=== ALL TESTS PASSED ===\n');
console.log('✓ Generator: Tokenizer and Parser working correctly');
console.log('✓ ORM Manager: Database migrations working');
console.log('✓ Schema: Generated files validated');
console.log('\n✅ Verification complete - System is ready for use!\n');
