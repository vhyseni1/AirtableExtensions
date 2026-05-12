import React from 'react';
import {colors, typography} from '../theme';

const SEVERITY_OPTIONS = ['All', 'High', 'Medium', 'Low'];
const DIMENSION_OPTIONS = ['All', 'Accuracy', 'Consistency', 'Completeness', 'Referential', 'Validity', 'Uniqueness'];

function chevronDataUri(stroke) {
    const encoded = stroke.replace('#', '%23');
    return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='${encoded}' fill='none' stroke-width='1.5'/></svg>")`;
}

function Chip({label, value, options, onChange}) {
    const isActive = value !== 'All';
    return (
        <label
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: colors.white,
                border: `1px solid ${isActive ? colors.rocheBlue : colors.border}`,
                borderRadius: 16,
                fontFamily: typography.family,
                fontSize: 12,
                color: colors.textSecondary,
                cursor: 'pointer',
            }}
        >
            <span>{label}:</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: typography.family,
                    fontSize: 12,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? colors.rocheBlue : colors.textPrimary,
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    paddingRight: 14,
                    backgroundImage: chevronDataUri(colors.textSecondary),
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right center',
                }}
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        </label>
    );
}

export default function FilterBar({filters, rrpList, sourceTablesList, onChange, onReset}) {
    const anyActive =
        filters.severity !== 'All' ||
        filters.dimension !== 'All' ||
        filters.sourceTable !== 'All' ||
        filters.ownerRrp !== 'All';

    return (
        <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 5,
                background: colors.bgPage,
                padding: '12px 24px',
                borderBottom: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: typography.family,
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                <Chip
                    label="Severity"
                    value={filters.severity}
                    options={SEVERITY_OPTIONS}
                    onChange={v => onChange({...filters, severity: v})}
                />
                <Chip
                    label="Dimension"
                    value={filters.dimension}
                    options={DIMENSION_OPTIONS}
                    onChange={v => onChange({...filters, dimension: v})}
                />
                <Chip
                    label="Source table"
                    value={filters.sourceTable}
                    options={['All', ...sourceTablesList]}
                    onChange={v => onChange({...filters, sourceTable: v})}
                />
                <Chip
                    label="Owner RRP"
                    value={filters.ownerRrp}
                    options={['All', ...rrpList]}
                    onChange={v => onChange({...filters, ownerRrp: v})}
                />
            </div>
            <button
                type="button"
                onClick={onReset}
                disabled={!anyActive}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: anyActive ? colors.rocheBlue : colors.textTertiary,
                    fontFamily: typography.family,
                    fontSize: 12,
                    cursor: anyActive ? 'pointer' : 'default',
                    padding: '6px 8px',
                }}
            >
                Reset filters
            </button>
        </div>
    );
}
