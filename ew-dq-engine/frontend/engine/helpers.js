// Helpers for reading values from the Rules table that may have been
// imported with different field types (single-select vs. checkbox vs.
// plain text). The CSV import path in particular can turn a Yes/No
// column into a Checkbox field, which breaks naive `=== 'Yes'`
// comparisons.

export function isRuleActive(value) {
    if (value === true) return true;
    if (typeof value === 'string') {
        return value.trim().toLowerCase() === 'yes';
    }
    if (value && typeof value === 'object' && 'name' in value) {
        return typeof value.name === 'string'
            && value.name.trim().toLowerCase() === 'yes';
    }
    return false;
}

export function asNormalizedString(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && 'name' in value) {
        return typeof value.name === 'string' ? value.name : '';
    }
    return String(value);
}
