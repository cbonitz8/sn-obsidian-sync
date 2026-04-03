# Endpoint: GET /metadata

Resource under the `your_api_id` Scripted REST API.

## Resource Config

| Field | Value |
|-------|-------|
| Name | `getMetadata` |
| HTTP Method | GET |
| Relative path | `/metadata` |

## What It Returns

```json
{
  "result": {
    "categories": [
      { "value": "session_log", "label": "Session Log" },
      { "value": "project_overview", "label": "Project Overview" },
      { "value": "qa_document", "label": "QA Document" },
      { "value": "design_spec", "label": "Design Spec" },
      { "value": "reference", "label": "Reference" }
    ],
    "projects": [
      { "value": "project_alpha", "label": "Project Alpha" },
      { "value": "project_beta", "label": "Project Beta" }
    ],
    "tags": ["archived", "complete"]
  }
}
```

**Prerequisites:** Configure your choice values on the table's `u_category` and `u_project` fields before this endpoint will return useful data.

- **categories** — from `sys_choice` for `u_category` on `u_your_table`, ordered by sequence
- **projects** — from `sys_choice` for `u_project` on `u_your_table`, ordered by sequence
- **tags** — distinct comma-split values from `u_tags` across all `u_your_table` records

## Script

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
