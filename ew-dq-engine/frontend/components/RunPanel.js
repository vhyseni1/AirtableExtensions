import React from 'react';
import {Box, Button, Text, ProgressBar, Heading} from '@airtable/blocks/ui';

export default function RunPanel({running, progress, summary, onRun}) {
    const label = running ? 'Running…' : summary ? 'Run again' : 'Run checks';

    return (
        <Box marginBottom={3}>
            <Button
                variant="primary"
                size="large"
                disabled={running}
                onClick={onRun}
            >
                {label}
            </Button>

            {running && progress && (
                <Box marginTop={2}>
                    <Text marginBottom={1}>
                        Rule {progress.current} of {progress.total}: {progress.ruleId} — {progress.ruleName}
                    </Text>
                    <ProgressBar progress={progress.current / progress.total} />
                </Box>
            )}

            {summary && !running && (
                <Box marginTop={3} padding={2} border="thick" borderRadius="default">
                    <Heading size="small" marginBottom={2}>Summary</Heading>
                    <Text>Total exceptions: <strong>{summary.total}</strong></Text>
                    <Text>Duration: {summary.duration.toFixed(1)}s</Text>

                    <Box marginTop={2}>
                        <Text variant="paragraph"><strong>By severity</strong></Text>
                        {Object.entries(summary.severity).map(([k, v]) => (
                            <Text key={k}>{k}: {v}</Text>
                        ))}
                    </Box>

                    <Box marginTop={2}>
                        <Text variant="paragraph"><strong>By dimension</strong></Text>
                        {Object.entries(summary.dimension).map(([k, v]) => (
                            <Text key={k}>{k}: {v}</Text>
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
}
