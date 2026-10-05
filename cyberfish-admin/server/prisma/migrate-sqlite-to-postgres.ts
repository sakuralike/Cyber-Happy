/**
 * 保留数据的 SQLite -> PostgreSQL 迁移助手。
 *
 * 该脚本不修改仓库中的 schema.prisma/provider，也不负责创建远端数据库。
 * 默认只做 plan；真正写入必须显式传 --execute --confirm-source-stop --backup。
 * 目标库必须是空数据库，迁移失败时目标事务会回滚，源库不会被修改。
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type AnyClient = {
  _runtimeDataModel: { models: Record<string, RuntimeModel> };
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(
    callback: (tx: AnyClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
  [key: string]: unknown;
};

type RuntimeField = {
  name: string;
  dbName?: string | null;
  kind: string;
  type: string;
  isList: boolean;
  relationFromFields?: string[];
};

type RuntimeModel = {
  dbName?: string | null;
  fields: RuntimeField[];
};

type ModelPlan = {
  name: string;
  table: string;
  delegate: string;
  scalarFields: RuntimeField[];
  dependencies: string[];
};

type CliOptions = {
  sourceUrl: string;
  targetUrl: string;
  schemaPath: string;
  backupPath?: string;
  execute: boolean;
  confirmSourceStop: boolean;
  batchSize: number;
  keepTemp: boolean;
  baselineOut?: string;
};

type ModelReport = {
  model: string;
  rows: number;
  sourceSha256: string;
  targetSha256?: string;
};

const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 1_000;

function usage(): void {
  console.log(`用法：
  npm run db:migrate:postgres -- --source-url <file:...> --target-url <postgresql://...> [选项]

默认只执行只读 plan。写入迁移必须同时提供：
  --execute --confirm-source-stop --backup <SQLite 备份路径>

选项：
  --schema <path>       Prisma schema，默认 prisma/schema.prisma
  --batch-size <n>      每批导入行数，默认 ${DEFAULT_BATCH_SIZE}，最大 ${MAX_BATCH_SIZE}
  --baseline-out <path> 将 PostgreSQL baseline SQL 另存为指定文件
  --keep-temp           保留临时 Prisma client 目录以便故障诊断
  --help                显示帮助
`);
}

function parseOptions(argv: string[]): CliOptions {
  let sourceUrl = process.env.SOURCE_DATABASE_URL ?? '';
  let targetUrl = process.env.TARGET_DATABASE_URL ?? '';
  let schemaPath = path.resolve(__dirname, 'schema.prisma');
  let backupPath: string | undefined;
  let execute = false;
  let confirmSourceStop = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let keepTemp = false;
  let baselineOut: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--confirm-source-stop') {
      confirmSourceStop = true;
      continue;
    }
    if (arg === '--keep-temp') {
      keepTemp = true;
      continue;
    }
    const next = (): string => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 需要参数`);
      i += 1;
      return value;
    };
    if (arg === '--source-url') {
      sourceUrl = next();
    } else if (arg === '--target-url') {
      targetUrl = next();
    } else if (arg === '--schema') {
      schemaPath = path.resolve(next());
    } else if (arg === '--backup') {
      backupPath = path.resolve(next());
    } else if (arg === '--batch-size') {
      batchSize = Number(next());
    } else if (arg === '--baseline-out') {
      baselineOut = path.resolve(next());
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (!sourceUrl.startsWith('file:')) throw new Error('source-url 必须是 SQLite file: URL');
  if (!/^postgres(?:ql)?:\/\//i.test(targetUrl)) {
    throw new Error('target-url 必须是 PostgreSQL URL（postgresql:// 或 postgres://）');
  }
  if (!fs.existsSync(schemaPath)) throw new Error(`找不到 Prisma schema：${schemaPath}`);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`batch-size 必须是 1-${MAX_BATCH_SIZE} 的整数`);
  }
  if (execute && (!confirmSourceStop || !backupPath)) {
    throw new Error('execute 必须同时提供 --confirm-source-stop 与 --backup');
  }
  return {
    sourceUrl,
    targetUrl,
    schemaPath,
    backupPath,
    execute,
    confirmSourceStop,
    batchSize,
    keepTemp,
    baselineOut,
  };
}

function redactUrl(url: string): string {
  if (url.startsWith('file:')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return parsed.toString();
  } catch {
    return '<invalid-url>';
  }
}

function prismaCli(serverRoot: string): string {
  const candidates = [serverRoot, path.resolve(serverRoot, '..')];
  for (const candidate of candidates) {
    try {
      return require.resolve('prisma/build/index.js', { paths: [candidate] });
    } catch {
      // 继续尝试 workspace 根目录。
    }
  }
  throw new Error(`找不到 Prisma CLI（搜索路径：${candidates.join(', ')}）`);
}

function writeVariantSchema(
  sourceSchema: string,
  destinationDir: string,
  provider: 'sqlite' | 'postgresql',
): string {
  const datasourcePattern = /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*)"[^"]+"/;
  const generatorPattern = /(generator\s+client\s*\{[\s\S]*?provider\s*=\s*"prisma-client-js")/;
  if (!datasourcePattern.test(sourceSchema)) throw new Error('schema 中找不到 datasource db provider');
  if (!generatorPattern.test(sourceSchema)) throw new Error('schema 中找不到 prisma-client-js generator');
  const withProvider = sourceSchema.replace(datasourcePattern, `$1"${provider}"`);
  const withOutput = withProvider.replace(generatorPattern, '$1\n  output = "./client"');
  const schemaPath = path.join(destinationDir, 'schema.prisma');
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.writeFileSync(schemaPath, withOutput, 'utf8');
  return schemaPath;
}

function generateClient(
  schemaPath: string,
  serverRoot: string,
  databaseUrl: string,
): string {
  const cli = prismaCli(serverRoot);
  execFileSync(process.execPath, [cli, 'generate', '--schema', schemaPath], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
    },
    stdio: 'inherit',
  });
  return path.join(path.dirname(schemaPath), 'client');
}

function loadClientForUrl(clientDir: string, url: string): AnyClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const module = require(clientDir) as { PrismaClient?: new (options?: unknown) => AnyClient };
  if (!module.PrismaClient) throw new Error(`临时 Prisma client 缺少 PrismaClient：${clientDir}`);
  return new module.PrismaClient({ datasourceUrl: url });
}

function scalarFields(model: RuntimeModel): RuntimeField[] {
  return model.fields.filter((field) => field.kind === 'scalar' && !field.isList);
}

function modelPlans(client: AnyClient): ModelPlan[] {
  const models = client._runtimeDataModel.models;
  const plans = Object.entries(models).map(([name, model]) => {
    const deps = model.fields
      .filter((field) => field.kind === 'object' && (field.relationFromFields?.length ?? 0) > 0)
      .map((field) => field.type);
    return {
      name,
      table: model.dbName ?? name,
      delegate: `${name.slice(0, 1).toLowerCase()}${name.slice(1)}`,
      scalarFields: scalarFields(model),
      dependencies: [...new Set(deps)],
    };
  });

  const byName = new Map(plans.map((plan) => [plan.name, plan]));
  const ordered: ModelPlan[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (plan: ModelPlan): void => {
    if (visited.has(plan.name)) return;
    if (visiting.has(plan.name)) throw new Error(`检测到无法自动排序的循环外键：${plan.name}`);
    visiting.add(plan.name);
    for (const dependency of plan.dependencies) {
      const parent = byName.get(dependency);
      if (!parent) throw new Error(`${plan.name} 引用了未知模型 ${dependency}`);
      visit(parent);
    }
    visiting.delete(plan.name);
    visited.add(plan.name);
    ordered.push(plan);
  };
  plans.forEach(visit);
  return ordered;
}

function selectFor(plan: ModelPlan): Record<string, true> {
  return Object.fromEntries(plan.scalarFields.map((field) => [field.name, true])) as Record<string, true>;
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (typeof value === 'boolean') return `bool:${value ? '1' : '0'}`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`发现不可迁移的非有限数值：${value}`);
    return `number:${String(value)}`;
  }
  return `string:${String(value)}`;
}

async function readRows(client: AnyClient, plan: ModelPlan, batchSize: number): Promise<unknown[][]> {
  const delegate = client[plan.delegate] as {
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
  };
  const rows: unknown[][] = [];
  let skip = 0;
  while (true) {
    const page = await delegate.findMany({
      select: selectFor(plan),
      orderBy: { id: 'asc' },
      skip,
      take: batchSize,
    });
    if (page.length === 0) break;
    for (const row of page) rows.push(plan.scalarFields.map((field) => row[field.name]));
    if (page.length < batchSize) break;
    skip += page.length;
  }
  return rows;
}

async function digestModel(
  client: AnyClient,
  plan: ModelPlan,
  batchSize: number,
): Promise<{ rows: number; sha256: string }> {
  const delegate = client[plan.delegate] as {
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
  };
  const hash = createHash('sha256');
  let count = 0;
  let skip = 0;
  while (true) {
    const page = await delegate.findMany({
      select: selectFor(plan),
      orderBy: { id: 'asc' },
      skip,
      take: batchSize,
    });
    if (page.length === 0) break;
    for (const row of page) {
      hash.update(plan.scalarFields.map((field) => normalizeValue(row[field.name])).join('\u001f'));
      hash.update('\n');
      count += 1;
    }
    if (page.length < batchSize) break;
    skip += page.length;
  }
  return { rows: count, sha256: hash.digest('hex') };
}

function sqlitePathFromUrl(url: string, schemaPath: string): string {
  const raw = url.slice('file:'.length).split('?')[0];
  if (!raw) throw new Error('SQLite URL 没有文件路径');
  const decoded = decodeURIComponent(raw);
  if (decoded === ':memory:') throw new Error('不支持从 SQLite :memory: 迁移');
  return path.resolve(path.dirname(schemaPath), decoded);
}

function sqliteUrl(filePath: string): string {
  return `file:${filePath.replaceAll('\\', '/')}`;
}

async function sqliteIntegrity(client: AnyClient): Promise<void> {
  const quick = (await client.$queryRawUnsafe<Array<{ integrity_check: string }>>(
    'PRAGMA integrity_check',
  ))[0]?.integrity_check;
  if (quick !== 'ok') throw new Error(`SQLite integrity_check 失败：${String(quick)}`);
  const foreignKeys = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    'PRAGMA foreign_key_check',
  );
  if (foreignKeys.length > 0) throw new Error(`SQLite foreign_key_check 发现 ${foreignKeys.length} 个问题`);
}

async function createBackup(
  source: AnyClient,
  sourceUrl: string,
  backupPath: string,
  schemaPath: string,
): Promise<string> {
  if (!sourceUrl.startsWith('file:')) throw new Error('仅支持 SQLite 备份');
  const sourcePath = sqlitePathFromUrl(sourceUrl, schemaPath);
  if (!fs.existsSync(sourcePath)) throw new Error(`找不到源 SQLite 文件：${sourcePath}`);
  if (path.resolve(sourcePath) === path.resolve(backupPath)) throw new Error('备份路径不能与源文件相同');
  if (fs.existsSync(backupPath)) throw new Error(`备份目标已存在，为避免覆盖而停止：${backupPath}`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  const escaped = backupPath.replaceAll("'", "''");
  await source.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
  if (!fs.existsSync(backupPath)) throw new Error(`VACUUM INTO 未生成备份：${backupPath}`);
  return sqliteUrl(backupPath);
}

async function assertTargetEmpty(target: AnyClient): Promise<void> {
  const tables = await target.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  if (tables.length > 0) {
    throw new Error(`目标 PostgreSQL 不是空库（已有表：${tables.map((row) => row.table_name).join(', ')}）`);
  }
}

function pushPostgresSchema(targetSchema: string, serverRoot: string, targetUrl: string): void {
  const cli = prismaCli(serverRoot);
  execFileSync(process.execPath, [cli, 'db', 'push', '--schema', targetSchema, '--skip-generate'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
    },
    stdio: 'inherit',
  });
}

function validatePostgresSchema(targetSchema: string, serverRoot: string, targetUrl: string): void {
  const cli = prismaCli(serverRoot);
  execFileSync(process.execPath, [cli, 'validate', '--schema', targetSchema], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
    },
    stdio: 'inherit',
  });
}

function generatePostgresBaseline(
  targetSchema: string,
  serverRoot: string,
  targetUrl: string,
  outputPath?: string,
): number {
  const cli = prismaCli(serverRoot);
  const script = execFileSync(
    process.execPath,
    [cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', targetSchema, '--script'],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, script, 'utf8');
  }
  return Buffer.byteLength(script, 'utf8');
}

async function importModels(
  source: AnyClient,
  target: AnyClient,
  plans: ModelPlan[],
  batchSize: number,
): Promise<void> {
  await target.$transaction(
    async (tx) => {
      for (const plan of plans) {
        const rows = await readRows(source, plan, batchSize);
        if (rows.length === 0) continue;
        const delegate = tx[plan.delegate] as { createMany(args: unknown): Promise<unknown> };
        for (let offset = 0; offset < rows.length; offset += batchSize) {
          const page = rows.slice(offset, offset + batchSize);
          const data = page.map((values) =>
            Object.fromEntries(plan.scalarFields.map((field, index) => [field.name, values[index]])),
          );
          await delegate.createMany({ data });
        }
        console.log(`  ${plan.name}: ${rows.length} 行`);
      }
    },
    { maxWait: 30_000, timeout: 15 * 60_000 },
  );
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const serverRoot = path.resolve(__dirname, '..');
  const sourceSchemaText = fs.readFileSync(options.schemaPath, 'utf8');
  // 变体 schema 位于临时目录，必须先把相对 SQLite URL 固化为绝对路径，
  // 否则 Prisma 会相对于临时 schema 查找 dev.db。
  const sourceUrl = sqliteUrl(sqlitePathFromUrl(options.sourceUrl, options.schemaPath));
  // 临时 schema 放在 server 工程树内，使 Prisma 能解析 workspace 中的
  // @prisma/client；正常结束时会清理，不会留下仓库文件。
  const tempBase = path.join(serverRoot, 'tmp');
  fs.mkdirSync(tempBase, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(tempBase, 'cyberfish-pg-migration-'));
  let source: AnyClient | undefined;
  let target: AnyClient | undefined;
  let backupUrl = options.sourceUrl;

  console.log(`模式：${options.execute ? 'execute' : 'plan'}`);
  console.log(`源库：${redactUrl(options.sourceUrl)}`);
  console.log(`目标：${redactUrl(options.targetUrl)}`);

  try {
    const sourceSchema = writeVariantSchema(sourceSchemaText, path.join(tempRoot, 'source'), 'sqlite');
    const sourceClientDir = generateClient(sourceSchema, serverRoot, sourceUrl);
    source = loadClientForUrl(sourceClientDir, sourceUrl);
    await source.$connect();
    await sqliteIntegrity(source);

    const plans = modelPlans(source);
    const sourceReports: ModelReport[] = [];
    for (const plan of plans) {
      const digest = await digestModel(source, plan, options.batchSize);
      sourceReports.push({ model: plan.name, rows: digest.rows, sourceSha256: digest.sha256 });
    }
    console.log(`源库通过完整性检查，共 ${sourceReports.reduce((sum, item) => sum + item.rows, 0)} 行`);
    const targetSchema = writeVariantSchema(
      sourceSchemaText,
      path.join(tempRoot, 'target'),
      'postgresql',
    );
    validatePostgresSchema(targetSchema, serverRoot, options.targetUrl);
    console.log('PostgreSQL schema validate 通过。');
    const baselineBytes = generatePostgresBaseline(
      targetSchema,
      serverRoot,
      options.targetUrl,
      options.baselineOut,
    );
    console.log(`PostgreSQL baseline diff 生成通过（${baselineBytes} bytes）。`);
    if (!options.execute) {
      console.log('plan 完成：未创建目标 schema，未写入任何数据库。');
      return;
    }

    backupUrl = await createBackup(source, sourceUrl, options.backupPath!, options.schemaPath);
    await source.$disconnect();
    source = undefined;

    // 迁移只读取备份快照，避免源库在迁移期间发生漂移。
    const backupSchema = writeVariantSchema(sourceSchemaText, path.join(tempRoot, 'backup'), 'sqlite');
    const backupClientDir = generateClient(backupSchema, serverRoot, backupUrl);
    source = loadClientForUrl(backupClientDir, backupUrl);
    await source.$connect();
    await sqliteIntegrity(source);

    const targetClientDir = generateClient(targetSchema, serverRoot, options.targetUrl);
    target = loadClientForUrl(targetClientDir, options.targetUrl);
    await target.$connect();
    await assertTargetEmpty(target);
    pushPostgresSchema(targetSchema, serverRoot, options.targetUrl);

    console.log('开始按外键拓扑顺序导入（事务内）…');
    await importModels(source, target, plans, options.batchSize);

    const targetReports: ModelReport[] = [];
    for (const plan of plans) {
      const digest = await digestModel(target, plan, options.batchSize);
      targetReports.push({ model: plan.name, rows: digest.rows, sourceSha256: '', targetSha256: digest.sha256 });
    }
    const mismatches: string[] = [];
    for (const expected of sourceReports) {
      const actual = targetReports.find((item) => item.model === expected.model)!;
      if (expected.rows !== actual.rows || expected.sourceSha256 !== actual.targetSha256) {
        mismatches.push(`${expected.model}: source ${expected.rows}/${expected.sourceSha256}, target ${actual.rows}/${actual.targetSha256}`);
      }
    }
    if (mismatches.length > 0) throw new Error(`迁移对账失败：\n${mismatches.join('\n')}`);
    console.log(`迁移完成并对账通过：${sourceReports.length} 张表，${sourceReports.reduce((sum, item) => sum + item.rows, 0)} 行。`);
    console.log(`SQLite 回滚快照：${options.backupPath}`);
  } finally {
    await target?.$disconnect().catch(() => undefined);
    await source?.$disconnect().catch(() => undefined);
    if (!options.keepTemp) {
      let removed = false;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          fs.rmSync(tempRoot, { recursive: true, force: true });
          removed = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      if (!removed) {
        console.warn(`临时目录清理失败（可手动删除）：${tempRoot}`);
      }
    } else {
      console.log(`临时目录：${tempRoot}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`迁移停止：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
