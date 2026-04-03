# ServiceNow Side Implementation Guide

> **Note:** This guide uses placeholder values. Replace them with your own: `u_your_table` -> your table name, `your_api_id` -> your API ID, `yourinstance` -> your SN instance.

This document covers everything that needs to be created/configured on the ServiceNow dev instance to support the Obsidian sync plugin.

---

## 1. OAuth Application Registration

**Navigate to:** System OAuth > Application Registry > New > "Create an OAuth API endpoint for external clients"

| Field | Value |
|-------|-------|
| Name | `Obsidian Sync` |
| Client ID | (auto-generated — copy this for the plugin settings) |
| Client Secret | (auto-generated — copy this for the plugin settings) |
| Redirect URL | `obsidian://sn-obsidian-sync/callback` |
| Token Lifespan | `1800` (30 minutes, default is fine) |
| Refresh Token Lifespan | `8640000` (100 days) |
| Active | true |

After creating, copy the **Client ID** and **Client Secret** into the Obsidian plugin settings.

---

## 2. Scripted REST API: `your_api_id`

**Navigate to:** System Web Services > Scripted REST APIs > New

| Field | Value |
|-------|-------|
| Name | `Your API Name` |
| API ID | `your_api_id` |
| API Namespace | `x_your_scope` (your app scope) |
| Active | true |

This creates the base path: `/api/x_your_scope/your_api_id`

### Table Reference

All operations target the existing `u_your_table` table. Required fields:

| Field | Column Name | Type |
|-------|-------------|------|
| Title | `u_title` | String |
| Content | `u_content` | String (large) |
| Category | `u_category` | Choice |
| Project | `u_project` | String |
| Tags | `u_tags` | String |
| Checked Out By | `u_checked_out_by` | Reference (sys_user) |

System fields used: `sys_id`, `sys_updated_on`, `sys_created_on`

---

## 3. REST Resources (Endpoints)

Create each of these as a **Resource** under the `your_api_id` Scripted REST API.

### 3.1 GET /documents — List all documents

| Field | Value |
|-------|-------|
| Name | `getDocuments` |
| HTTP Method | GET |
| Relative path | `/documents` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var gr = new GlideRecord('u_your_table');
    gr.orderByDesc('sys_updated_on');
    gr.query();

    var results = [];
    while (gr.next()) {
        results.push({
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        });
    }

    response.setBody({ result: results });
})(request, response);
```

---

### 3.2 GET /documents/{id} — Get single document

| Field | Value |
|-------|-------|
| Name | `getDocument` |
| HTTP Method | GET |
| Relative path | `/documents/{id}` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var id = request.pathParams.id;
    var gr = new GlideRecord('u_your_table');

    if (!gr.get(id)) {
        response.setStatus(404);
        response.setBody({ error: 'Document not found' });
        return;
    }

    response.setBody({
        result: {
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        }
    });
})(request, response);
```

---

### 3.3 POST /documents — Create document

| Field | Value |
|-------|-------|
| Name | `createDocument` |
| HTTP Method | POST |
| Relative path | `/documents` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var body = request.body.data;
    var gr = new GlideRecord('u_your_table');
    gr.initialize();
    gr.setValue('u_title', body.title || '');
    gr.setValue('u_content', body.content || '');
    gr.setValue('u_category', body.category || '');
    gr.setValue('u_project', body.project || '');
    gr.setValue('u_tags', body.tags || '');
    gr.insert();

    // Re-read to get sys_updated_on
    gr.get(gr.getUniqueValue());

    response.setStatus(201);
    response.setBody({
        result: {
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        }
    });
})(request, response);
```

---

### 3.4 PUT /documents/{id} — Update document

| Field | Value |
|-------|-------|
| Name | `updateDocument` |
| HTTP Method | PUT |
| Relative path | `/documents/{id}` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var id = request.pathParams.id;
    var body = request.body.data;
    var gr = new GlideRecord('u_your_table');

    if (!gr.get(id)) {
        response.setStatus(404);
        response.setBody({ error: 'Document not found' });
        return;
    }

    // Check if doc is checked out by someone else
    var currentUser = gs.getUserID();
    var checkedOutBy = gr.getValue('u_checked_out_by');
    if (checkedOutBy && checkedOutBy !== currentUser) {
        response.setStatus(409);
        response.setBody({
            error: 'Document has been modified by another user',
            result: {
                sys_id: gr.getUniqueValue(),
                checked_out_by: checkedOutBy
            }
        });
        return;
    }

    if (body.title !== undefined) gr.setValue('u_title', body.title);
    if (body.content !== undefined) gr.setValue('u_content', body.content);
    if (body.category !== undefined) gr.setValue('u_category', body.category);
    if (body.project !== undefined) gr.setValue('u_project', body.project);
    if (body.tags !== undefined) gr.setValue('u_tags', body.tags);
    gr.update();

    // Re-read for updated timestamp
    gr.get(id);

    response.setBody({
        result: {
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        }
    });
})(request, response);
```

---

### 3.5 DELETE /documents/{id} — Delete document

| Field | Value |
|-------|-------|
| Name | `deleteDocument` |
| HTTP Method | DELETE |
| Relative path | `/documents/{id}` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var id = request.pathParams.id;
    var gr = new GlideRecord('u_your_table');

    if (!gr.get(id)) {
        response.setStatus(404);
        response.setBody({ error: 'Document not found' });
        return;
    }

    gr.deleteRecord();
    response.setStatus(204);
})(request, response);
```

---

### 3.6 GET /documents/changes — Get changed documents since timestamp

| Field | Value |
|-------|-------|
| Name | `getChanges` |
| HTTP Method | GET |
| Relative path | `/documents/changes` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var since = request.queryParams.since;

    if (!since) {
        response.setStatus(400);
        response.setBody({ error: 'Missing required parameter: since' });
        return;
    }

    var gr = new GlideRecord('u_your_table');
    gr.addQuery('sys_updated_on', '>', since);
    gr.orderByDesc('sys_updated_on');
    gr.query();

    var results = [];
    while (gr.next()) {
        results.push({
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        });
    }

    response.setBody({ result: results });
})(request, response);
```

---

### 3.7 POST /documents/{id}/checkout — Lock document

| Field | Value |
|-------|-------|
| Name | `checkout` |
| HTTP Method | POST |
| Relative path | `/documents/{id}/checkout` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var id = request.pathParams.id;
    var gr = new GlideRecord('u_your_table');

    if (!gr.get(id)) {
        response.setStatus(404);
        response.setBody({ error: 'Document not found' });
        return;
    }

    var checkedOutBy = gr.getValue('u_checked_out_by');
    var currentUser = gs.getUserID();

    // Already checked out by someone else
    if (checkedOutBy && checkedOutBy !== currentUser) {
        response.setStatus(423);
        response.setBody({
            error: 'Document is locked',
            result: {
                sys_id: gr.getUniqueValue(),
                checked_out_by: checkedOutBy
            }
        });
        return;
    }

    gr.setValue('u_checked_out_by', currentUser);
    gr.update();

    gr.get(id);
    response.setBody({
        result: {
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        }
    });
})(request, response);
```

---

### 3.8 POST /documents/{id}/checkin — Unlock document

| Field | Value |
|-------|-------|
| Name | `checkin` |
| HTTP Method | POST |
| Relative path | `/documents/{id}/checkin` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var id = request.pathParams.id;
    var gr = new GlideRecord('u_your_table');

    if (!gr.get(id)) {
        response.setStatus(404);
        response.setBody({ error: 'Document not found' });
        return;
    }

    var checkedOutBy = gr.getValue('u_checked_out_by');
    var currentUser = gs.getUserID();

    // Can only checkin if you're the one who checked it out
    if (checkedOutBy && checkedOutBy !== currentUser) {
        response.setStatus(403);
        response.setBody({ error: 'Document is checked out by another user' });
        return;
    }

    gr.setValue('u_checked_out_by', '');
    gr.update();

    gr.get(id);
    response.setBody({
        result: {
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        }
    });
})(request, response);
```

---

### 3.9 POST /documents/{id}/force-checkin — Admin unlock

| Field | Value |
|-------|-------|
| Name | `forceCheckin` |
| HTTP Method | POST |
| Relative path | `/documents/{id}/force-checkin` |

**Script:**

```javascript
(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
    var id = request.pathParams.id;
    var gr = new GlideRecord('u_your_table');

    if (!gr.get(id)) {
        response.setStatus(404);
        response.setBody({ error: 'Document not found' });
        return;
    }

    gr.setValue('u_checked_out_by', '');
    gr.update();

    gr.get(id);
    response.setBody({
        result: {
            sys_id: gr.getUniqueValue(),
            title: gr.getValue('u_title'),
            content: gr.getValue('u_content'),
            category: gr.getValue('u_category'),
            project: gr.getValue('u_project'),
            tags: gr.getValue('u_tags'),
            sys_updated_on: gr.getValue('sys_updated_on'),
            checked_out_by: gr.getValue('u_checked_out_by')
        }
    });
})(request, response);
```

---

### 3.10 GET /metadata — Get available categories, projects, and tags

| Field | Value |
|-------|-------|
| Name | `getMetadata` |
| HTTP Method | GET |
| Relative path | `/metadata` |

**Script:**

```javascript
(function process(request, response) {
    var categories = [];
    var grCat = new GlideRecord('sys_choice');
    grCat.addQuery('name', 'u_your_table');
    grCat.addQuery('element', 'u_category');
    grCat.addQuery('inactive', false);
    grCat.orderBy('sequence');
    grCat.query();
    while (grCat.next()) {
        categories.push({
            value: grCat.getValue('value'),
            label: grCat.getValue('label')
        });
    }

    var projects = [];
    var grProj = new GlideRecord('sys_choice');
    grProj.addQuery('name', 'u_your_table');
    grProj.addQuery('element', 'u_project');
    grProj.addQuery('inactive', false);
    grProj.orderBy('sequence');
    grProj.query();
    while (grProj.next()) {
        projects.push({
            value: grProj.getValue('value'),
            label: grProj.getValue('label')
        });
    }

    var tagSet = {};
    var grTag = new GlideRecord('u_your_table');
    grTag.addNotNullQuery('u_tags');
    grTag.query();
    while (grTag.next()) {
        var tagStr = grTag.getValue('u_tags') || '';
        tagStr.split(',').forEach(function(t) {
            var trimmed = t.trim();
            if (trimmed) tagSet[trimmed] = true;
        });
    }
    var tags = Object.keys(tagSet).sort();

    response.setBody({
        result: {
            categories: categories,
            projects: projects,
            tags: tags
        }
    });
})(request, response);
```

---

## 4. ACLs

Ensure the `u_your_table` table has appropriate ACLs:

| Operation | Role Required |
|-----------|---------------|
| Read | `your_read_role` (or whatever role your team uses) |
| Write | `your_read_role` |
| Create | `your_read_role` |
| Delete | `your_admin_role` |

The Scripted REST API inherits the calling user's permissions, so ACLs on the table control access. No additional API-level auth is needed beyond the OAuth token.

---

## 5. Verification Checklist

After creating everything, test each endpoint using the REST API Explorer (`/now/nav/ui/classic/params/target/%24restapi.do`):

- [ ] `GET /api/x_your_scope/your_api_id/documents` — returns list of docs
- [ ] `GET /api/x_your_scope/your_api_id/documents/{id}` — returns single doc
- [ ] `POST /api/x_your_scope/your_api_id/documents` — creates doc, returns full record with sys_id
- [ ] `PUT /api/x_your_scope/your_api_id/documents/{id}` — updates doc, returns full record
- [ ] `DELETE /api/x_your_scope/your_api_id/documents/{id}` — deletes doc, returns 204
- [ ] `GET /api/x_your_scope/your_api_id/documents/changes?since=2026-01-01` — returns changed docs
- [ ] `POST /api/x_your_scope/your_api_id/documents/{id}/checkout` — sets checked_out_by
- [ ] `POST /api/x_your_scope/your_api_id/documents/{id}/checkin` — clears checked_out_by
- [ ] `POST /api/x_your_scope/your_api_id/documents/{id}/force-checkin` — clears checked_out_by regardless of who locked it
- [ ] `GET /api/x_your_scope/your_api_id/metadata` — returns categories, projects, and tags

Also verify:
- [ ] OAuth app is active and redirect URL is correct
- [ ] All responses include `sys_id` and `sys_updated_on`
- [ ] Create/update responses return the full record (not just the sys_id)

---

## 6. Plugin Configuration

Once the SN side is ready, enter these in the Obsidian plugin settings:

| Setting | Value |
|---------|-------|
| Instance URL | `https://yourinstance.service-now.com` |
| API path | `/api/x_your_scope/your_api_id` |
| OAuth Client ID | (from step 1) |
| OAuth Client Secret | (from step 1) |

Then click **Authenticate** and log in through the browser.
