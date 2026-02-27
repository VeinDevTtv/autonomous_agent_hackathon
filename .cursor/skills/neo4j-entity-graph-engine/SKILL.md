---
name: neo4j-entity-graph-engine
description: Manages Neo4j-based graph storage and querying of extracted document entities (vendors, invoices, contracts, clauses, amounts). Use after the Extraction Agent has produced structured entities and when graph-based aggregation, clause comparison, or anomaly detection is required.
---

# Neo4j Entity Graph Engine

## Purpose

Use this skill to manage a Neo4j-backed entity graph for documents that have already been parsed by the Extraction Agent. It focuses on:

- Storing vendors, invoices, contracts, clauses, and amounts as nodes
- Creating relationships between those nodes
- Running Cypher queries for aggregation, anomaly detection, and clause comparison

Supabase remains the system of record for embeddings, files, and vector search. Neo4j is **only** for entity relationships and graph reasoning.

## When to Use

- After the Extraction Agent has produced structured entities from invoices/contracts
- When the Reasoning Agent needs:
  - Vendor-level invoice aggregation
  - Detection of invoices over a threshold
  - Comparison of clauses between contracts
  - Identification of liability clauses and related risk patterns

---

## Graph Model

### Node Labels and Properties

- `Vendor { id, name }`
- `Invoice { id, total, date }`
- `Contract { id, title }`
- `Clause { id, type, content }`
- `Amount { value }`

### Relationships

- `(Vendor)-[:ISSUED]->(Invoice)`
- `(Invoice)-[:REFERENCES]->(Contract)`
- `(Contract)-[:CONTAINS]->(Clause)`
- `(Invoice)-[:HAS_AMOUNT]->(Amount)`

The `id` properties should be stable identifiers coming from the Extraction Agent (e.g., document IDs, clause IDs generated during extraction).

---

## Environment and Libraries

- Use the official Neo4j JavaScript driver: `neo4j-driver`.
- Configure the connection via environment variables:
  - `NEO4J_URI` (e.g., `neo4j+s://...` or `bolt://localhost:7687`)
  - `NEO4J_USERNAME`
  - `NEO4J_PASSWORD`
- Maintain **one** shared driver instance per application; open short-lived sessions per unit of work.

### Connection Utility (Node / TypeScript style)

Use this pattern (adapt to the project’s module system and error handling):

```ts
import neo4j, { Driver, Session } from 'neo4j-driver'

let driver: Driver | null = null

export function getNeo4jDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI!
    const user = process.env.NEO4J_USERNAME!
    const password = process.env.NEO4J_PASSWORD!

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  }
  return driver
}

export function getSession(mode: 'READ' | 'WRITE' = 'WRITE'): Session {
  const drv = getNeo4jDriver()
  return drv.session({ defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE })
}
```

Always close sessions after use; close the driver on application shutdown.

---

## Schema Initialization

Run these **id-based unique constraints** once (e.g., via a migration step or an initialization script). Use `IF NOT EXISTS` to keep it idempotent:

```cypher
CREATE CONSTRAINT vendor_id_unique IF NOT EXISTS
FOR (v:Vendor)
REQUIRE v.id IS UNIQUE;

CREATE CONSTRAINT invoice_id_unique IF NOT EXISTS
FOR (i:Invoice)
REQUIRE i.id IS UNIQUE;

CREATE CONSTRAINT contract_id_unique IF NOT EXISTS
FOR (c:Contract)
REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT clause_id_unique IF NOT EXISTS
FOR (cl:Clause)
REQUIRE cl.id IS UNIQUE;
```

`Amount` nodes typically do not require a uniqueness constraint, since multiple invoices can legitimately share the same numeric value.

### Running Initialization from Code

Use a write session and parameterless Cypher:

```ts
import { getSession } from './neo4j'

export async function ensureGraphSchema() {
  const session = getSession('WRITE')
  try {
    const statements = [
      `CREATE CONSTRAINT vendor_id_unique IF NOT EXISTS
       FOR (v:Vendor) REQUIRE v.id IS UNIQUE`,
      `CREATE CONSTRAINT invoice_id_unique IF NOT EXISTS
       FOR (i:Invoice) REQUIRE i.id IS UNIQUE`,
      `CREATE CONSTRAINT contract_id_unique IF NOT EXISTS
       FOR (c:Contract) REQUIRE c.id IS UNIQUE`,
      `CREATE CONSTRAINT clause_id_unique IF NOT EXISTS
       FOR (cl:Clause) REQUIRE cl.id IS UNIQUE`
    ]

    for (const text of statements) {
      await session.run(text)
    }
  } finally {
    await session.close()
  }
}
```

---

## Ingestion: Upserting Nodes and Relationships

### Expected Extraction Payload (Example Shape)

Infer or adapt to the actual Extraction Agent, but a typical shape:

```ts
type VendorEntity = { id: string; name: string }
type InvoiceEntity = { id: string; total: number; date: string; vendorId: string; contractId?: string }
type ContractEntity = { id: string; title: string }
type ClauseEntity = { id: string; type: string; content: string; contractId: string }
type AmountEntity = { invoiceId: string; value: number }
```

The ingestion logic should:

1. **MERGE nodes** by `id` (or invoice ID for `Amount`).
2. **SET/UPDATE properties** when nodes already exist.
3. **MERGE relationships** using node IDs to avoid duplicates.
4. Use **parameterized Cypher**; never interpolate values directly into query strings.

### Upsert Patterns (Cypher)

**Vendor:**

```cypher
MERGE (v:Vendor { id: $id })
SET v.name = $name
```

**Invoice:**

```cypher
MERGE (i:Invoice { id: $id })
SET i.total = $total,
    i.date  = $date
```

**Contract:**

```cypher
MERGE (c:Contract { id: $id })
SET c.title = $title
```

**Clause:**

```cypher
MERGE (cl:Clause { id: $id })
SET cl.type    = $type,
    cl.content = $content
```

**Amount linked to Invoice:**

```cypher
MERGE (i:Invoice { id: $invoiceId })
MERGE (a:Amount { value: $value })
MERGE (i)-[:HAS_AMOUNT]->(a)
```

### Relationship Patterns

- Vendor → Invoice:

```cypher
MATCH (v:Vendor { id: $vendorId })
MATCH (i:Invoice { id: $invoiceId })
MERGE (v)-[:ISSUED]->(i)
```

- Invoice → Contract:

```cypher
MATCH (i:Invoice { id: $invoiceId })
MATCH (c:Contract { id: $contractId })
MERGE (i)-[:REFERENCES]->(c)
```

- Contract → Clause:

```cypher
MATCH (c:Contract { id: $contractId })
MATCH (cl:Clause { id: $clauseId })
MERGE (c)-[:CONTAINS]->(cl)
```

### Batched Ingestion (Pseudo-Code)

Use a write transaction per document batch:

```ts
import { getSession } from './neo4j'

export async function ingestExtractionResult(payload: {
  vendors: VendorEntity[]
  invoices: InvoiceEntity[]
  contracts: ContractEntity[]
  clauses: ClauseEntity[]
  amounts: AmountEntity[]
}) {
  const session = getSession('WRITE')
  try {
    await session.executeWrite(async tx => {
      // 1) Upsert nodes
      // 2) Create relationships
      // Use tx.run(cypher, params) with the patterns defined above
    })
  } finally {
    await session.close()
  }
}
```

Keep ingestion logic deterministic and idempotent: re-running ingestion for the same extraction should not create duplicates.

---

## Query Utilities for the Reasoning Agent

The Reasoning Agent should call small, focused query utilities that:

- Accept a structured input (e.g., threshold, list of vendors, contract IDs).
- Run parameterized Cypher queries via Neo4j sessions.
- Return **plain JSON objects** (no Neo4j driver types) to the caller.

### 1. Vendor Invoice Aggregation

**Intent:** Aggregate invoice totals per vendor across all documents.

**Cypher:**

```cypher
MATCH (v:Vendor)-[:ISSUED]->(i:Invoice)-[:HAS_AMOUNT]->(a:Amount)
RETURN
  v.id   AS vendorId,
  v.name AS vendorName,
  sum(a.value) AS totalAmount,
  count(DISTINCT i) AS invoiceCount
ORDER BY totalAmount DESC
```

**Result mapping (example):**

```ts
type VendorAggregationRow = {
  vendorId: string
  vendorName: string
  totalAmount: number
  invoiceCount: number
}
```

### 2. Detect Invoices Over Threshold

**Intent:** Flag invoices exceeding a monetary threshold for anomaly detection.

**Cypher:**

```cypher
MATCH (v:Vendor)-[:ISSUED]->(i:Invoice)-[:HAS_AMOUNT]->(a:Amount)
WHERE a.value > $threshold
RETURN
  v.id   AS vendorId,
  v.name AS vendorName,
  i.id   AS invoiceId,
  a.value AS amount,
  i.date  AS invoiceDate
ORDER BY a.value DESC
```

Use a parameter like `$threshold` (e.g., 5000) supplied by the Reasoning Agent.

### 3. Clause Comparison Between Contracts

**Intent:** Compare clauses (especially liability-related) across multiple contracts.

**Cypher (basic pairing by type):**

```cypher
MATCH (c1:Contract)-[:CONTAINS]->(cl1:Clause),
      (c2:Contract)-[:CONTAINS]->(cl2:Clause)
WHERE c1.id <> c2.id
  AND cl1.type = cl2.type
  AND cl1.type = $clauseType       // e.g., 'LIABILITY'
RETURN
  c1.id     AS contractId1,
  c1.title  AS contractTitle1,
  cl1.id    AS clauseId1,
  cl1.content AS clauseContent1,
  c2.id     AS contractId2,
  c2.title  AS contractTitle2,
  cl2.id    AS clauseId2,
  cl2.content AS clauseContent2
```

The Reasoning Agent can then semantically compare `clauseContent1` and `clauseContent2` using Gemini based on these results.

### 4. Liability Clause Detection

**Intent:** Find liability-related clauses to support risk analysis.

**Cypher (type-based + keyword search):**

```cypher
MATCH (c:Contract)-[:CONTAINS]->(cl:Clause)
WHERE toUpper(cl.type) = 'LIABILITY'
   OR cl.content CONTAINS $keyword
RETURN
  c.id      AS contractId,
  c.title   AS contractTitle,
  cl.id     AS clauseId,
  cl.type   AS clauseType,
  cl.content AS clauseContent
```

Use a keyword such as `'liability'`, `'indemnification'`, or other risk-related terms based on the current task.

---

## Returning Structured Results

When exposing query functions to the Reasoning Agent:

- **Always return JSON-serializable structures** (arrays/objects with primitives).
- Normalize field names to be descriptive and stable:
  - `vendorId`, `vendorName`, `totalAmount`, `invoiceCount`
  - `invoiceId`, `invoiceDate`, `amount`
  - `contractId`, `contractTitle`, `clauseId`, `clauseType`, `clauseContent`
- Avoid leaking driver-specific types; convert Neo4j integers to native numbers.

Example mapping of Neo4j results:

```ts
const rows = result.records.map(r => ({
  vendorId: r.get('vendorId'),
  vendorName: r.get('vendorName'),
  totalAmount: (r.get('totalAmount') as neo4j.Integer).toNumber(),
  invoiceCount: (r.get('invoiceCount') as neo4j.Integer).toNumber()
}))
```

---

## Constraints and Best Practices

- **Do not** use Neo4j as a replacement for Supabase:
  - Supabase remains the system for auth, storage, and vector search.
  - Neo4j is dedicated to entity relationships and graph reasoning.
- **Avoid duplicate nodes and relationships** by:
  - Using `MERGE` with stable `id` properties on nodes.
  - Using `MERGE` for relationships referencing those nodes.
- **Always use parameterized Cypher** to:
  - Prevent injection-style issues.
  - Reuse execution plans.
- Group writes into **transactions** (`executeWrite`) for consistency.
- For large datasets, page results or aggregate in Cypher to keep responses manageable for downstream agents.

---

## Quick Checklist for This Skill

- [ ] Ensure Neo4j driver is initialized with environment variables.
- [ ] Ensure schema constraints for `Vendor`, `Invoice`, `Contract`, `Clause` are created.
- [ ] Ingest Extraction Agent output using `MERGE`-based upserts.
- [ ] Create and maintain the four key relationship types.
- [ ] Implement aggregation and detection queries as small, focused utilities.
- [ ] Return clean, structured JSON results for the Reasoning Agent.

