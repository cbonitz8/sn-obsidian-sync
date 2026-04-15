# SN-Side Changes: Optimistic Locking via Content Hash

These are manual changes to make in ServiceNow. Do them in order.

## 1. Add Field to `u_ethos_md`

Navigate to the `u_ethos_md` table definition. Add:

| Field label | Column name | Type | Max length |
|-------------|------------|------|------------|
| Content Hash | u_content_hash | String | 32 |

No default value. Leave empty — backfill script populates it.

## 2. Add Script Include: `SnobbyContentHash`

Create a new Script Include (System Definition → Script Includes):

- **Name:** `SnobbyContentHash`
- **API Name:** `global.SnobbyContentHash`
- **Accessible from:** All application scopes
- **Active:** true

```javascript
var SnobbyContentHash = Class.create();
SnobbyContentHash.prototype = {
    initialize: function() {},

    /**
     * Normalize content for deterministic hashing.
     * Must produce identical output to the Obsidian plugin's normalizeContent().
     *
     * Steps:
     * 1. \r\n → \n, stray \r → \n
     * 2. Trim trailing whitespace per line
     * 3. Collapse trailing empty lines, ensure single trailing \n
     */
    normalizeContent: function(content) {
        if (!content) return '\n';
        // Step 1: normalize line endings
        var text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Step 2: trim trailing whitespace per line
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            lines[i] = lines[i].replace(/\s+$/, '');
        }
        // Step 3: collapse trailing empty lines
        while (lines.length > 1 && lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines.join('\n') + '\n';
    },

    /**
     * Compute MD5 hash of normalized content.
     * Returns 32-char lowercase hex string.
     */
    computeHash: function(content) {
        var gd = new GlideDigest();
        return gd.getMD5Hex(this.normalizeContent(content));
    },

    /**
     * Look up ancestor content from sys_audit.
     * Finds the version of u_content whose hash matches expectedHash.
     * Returns the content string, or null if not found.
     */
    findAncestor: function(docSysId, expectedHash) {
        var gr = new GlideRecord('sys_audit');
        gr.addQuery('tablename', 'u_ethos_md');
        gr.addQuery('documentkey', docSysId);
        gr.addQuery('fieldname', 'u_content');
        gr.orderByDesc('sys_created_on');
        gr.query();
        while (gr.next()) {
            var content = gr.getValue('newvalue');
            if (content && this.computeHash(content) === expectedHash) {
                return content;
            }
        }
        return null;
    },

    type: 'SnobbyContentHash'
};
```

### Verify the Script Include

Run in Scripts - Background:

```javascript
var sch = new SnobbyContentHash();

// Test vector 1: basic content
var r1 = sch.normalizeContent('hello  \nworld\n\n\n');
gs.info('Test 1: ' + JSON.stringify(r1));
gs.info('Expected: ' + JSON.stringify('hello\nworld\n'));
gs.info('Match: ' + (r1 === 'hello\nworld\n'));

// Test vector 2: \r\n
var r2 = sch.normalizeContent('hello\r\nworld\r\n');
gs.info('Test 2: ' + JSON.stringify(r2));
gs.info('Expected: ' + JSON.stringify('hello\nworld\n'));
gs.info('Match: ' + (r2 === 'hello\nworld\n'));

// Test vector 3: with frontmatter (preserved, not stripped)
var r3 = sch.normalizeContent('---\ndate: x\n---\nhello\n');
gs.info('Test 3: ' + JSON.stringify(r3));
gs.info('Expected: ' + JSON.stringify('---\ndate: x\n---\nhello\n'));
gs.info('Match: ' + (r3 === '---\ndate: x\n---\nhello\n'));

// Test vector 4: MD5 format
var hash = sch.computeHash('hello\nworld\n');
gs.info('Hash: ' + hash);
gs.info('Length: ' + hash.length);
gs.info('Is 32 hex chars: ' + /^[0-9a-f]{32}$/.test(hash));
```

All tests should print `Match: true`. Save the hash output from test vector 4 — you'll compare it against the plugin's `md5Hash('hello\nworld\n')` to verify cross-platform match.

## 3. Modify PUT `/documents/:id` Resource

In the `eg_docs` Scripted REST API, find the PUT resource for `/documents/{id}`.

### Add hash validation to the existing script

At the top of the PUT handler, after reading the request body and loading the GlideRecord, add:

```javascript
var sch = new SnobbyContentHash();
var body = request.body.data;
var expectedHash = body.expected_hash || null;

// ... existing: gr.get(id), check exists, etc. ...

// Hash validation (only if client sends expected_hash — backward compatible)
if (expectedHash) {
    var currentHash = gr.getValue('u_content_hash');
    if (currentHash && currentHash !== expectedHash) {
        // Conflict: remote changed since client last synced
        var ancestorContent = sch.findAncestor(id, expectedHash);
        response.setStatus(409);
        response.setBody({
            result: {
                conflict: true,
                content_hash: currentHash,
                content: gr.getValue('u_content'),
                sys_updated_on: gr.getValue('sys_updated_on'),
                ancestor_content: ancestorContent
            }
        });
        return;
    }
}
```

### After successful update, compute and store new hash

After the `gr.update()` call:

```javascript
// Compute and store content hash after update
var newHash = sch.computeHash(gr.getValue('u_content'));
gr.setValue('u_content_hash', newHash);
gr.setWorkflow(false);  // Don't re-trigger business rules
gr.update();
```

### Include hash in success response

In the response body, add `content_hash`:

```javascript
response.setBody({
    result: {
        sys_id: gr.getUniqueValue(),
        title: gr.getValue('u_title'),
        content: gr.getValue('u_content'),
        // ... existing fields ...
        content_hash: gr.getValue('u_content_hash')
    }
});
```

## 4. Modify GET Resources

For each GET resource (`/documents`, `/documents/{id}`, `/documents/changes`), add `content_hash` to the response object:

```javascript
content_hash: gr.getValue('u_content_hash')
```

Add this alongside the existing fields (`sys_id`, `title`, `content`, `category`, etc.) in the response body.

## 5. Modify POST `/documents` Resource

After creating the record (`gr.insert()`), compute and store the hash:

```javascript
var sch = new SnobbyContentHash();
var newHash = sch.computeHash(gr.getValue('u_content'));
gr.setValue('u_content_hash', newHash);
gr.setWorkflow(false);
gr.update();
```

Include `content_hash` in the POST response body.

## 6. Backfill Existing Documents

Run in Scripts - Background:

```javascript
var sch = new SnobbyContentHash();
var gr = new GlideRecord('u_ethos_md');
gr.query();
var count = 0;
while (gr.next()) {
    var content = gr.getValue('u_content');
    var hash = sch.computeHash(content);
    gr.setValue('u_content_hash', hash);
    gr.setWorkflow(false);
    gr.autoSysFields(false);  // Don't update sys_updated_on
    gr.update();
    count++;
}
gs.info('Backfilled ' + count + ' documents');
```

## 7. Verification Checklist

After all changes:

- [ ] `u_content_hash` field exists on `u_ethos_md`
- [ ] Script Include `SnobbyContentHash` is active
- [ ] Test vectors pass (step 2 verification)
- [ ] GET `/documents` response includes `content_hash` for each doc
- [ ] GET `/documents/{id}` response includes `content_hash`
- [ ] GET `/documents/changes` response includes `content_hash`
- [ ] POST `/documents` computes + stores hash, returns it
- [ ] PUT `/documents/{id}` without `expected_hash` → succeeds (backward compatible)
- [ ] PUT `/documents/{id}` with matching `expected_hash` → succeeds, new hash returned
- [ ] PUT `/documents/{id}` with wrong `expected_hash` → 409 with content + ancestor
- [ ] All existing docs have `u_content_hash` populated (backfill)

### Cross-platform hash verification

After the plugin is updated, run this comparison:

**SN side:**
```javascript
var sch = new SnobbyContentHash();
gs.info(sch.computeHash('---\ndate: 2026-04-14\ntype: standup\n---\n### Caleb\n\nHello world\n'));
```

**Plugin side (node):**
```javascript
const { md5Hash } = require('./src/content-hash');
console.log(md5Hash('---\ndate: 2026-04-14\ntype: standup\n---\n### Caleb\n\nHello world\n'));
```

Both must produce the same 32-char hex string.
