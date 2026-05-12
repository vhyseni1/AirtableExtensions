import React, {useState} from 'react';
import {Box, Heading, Switch, Text, Icon} from '@airtable/blocks/ui';
import {isRuleActive, asNormalizedString} from '../engine/helpers';

export default function RulesPanel({table, records, disabled}) {
    const [open, setOpen] = useState(false);

    if (!records) return null;

    const activeCount = records.filter(
        r => isRuleActive(r.getCellValue('Active')),
    ).length;

    async function toggle(record, on) {
        const activeField = table.getFieldByNameIfExists('Active');
        let payload;
        if (activeField && activeField.type === 'checkbox') {
            payload = on;
        } else if (activeField && activeField.type === 'singleLineText') {
            payload = on ? 'Yes' : 'No';
        } else {
            payload = {name: on ? 'Yes' : 'No'};
        }
        await table.updateRecordAsync(record, {Active: payload});
    }

    return (
        <Box marginBottom={3}>
            <Box
                display="flex"
                alignItems="center"
                style={{cursor: 'pointer'}}
                onClick={() => setOpen(!open)}
            >
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
                <Heading size="small" marginLeft={1}>
                    Active rules ({activeCount}/{records.length})
                </Heading>
            </Box>

            {open && (
                <Box marginTop={2} paddingLeft={2}>
                    {records.map(record => {
                        const id = asNormalizedString(record.getCellValue('Rule_ID'));
                        const name = asNormalizedString(record.getCellValue('Rule_Name'));
                        const severity = asNormalizedString(record.getCellValue('Severity'));
                        const isOn = isRuleActive(record.getCellValue('Active'));
                        return (
                            <Box
                                key={record.id}
                                display="flex"
                                alignItems="center"
                                marginBottom={1}
                            >
                                <Switch
                                    value={isOn}
                                    onChange={v => toggle(record, v)}
                                    disabled={disabled}
                                    label=""
                                    width="auto"
                                />
                                <Text marginLeft={2} flex="1">
                                    <strong>{id}</strong> — {name}
                                </Text>
                                <Text textColor="light">{severity}</Text>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}
