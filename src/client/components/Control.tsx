import React, { useContext, useState } from 'react';
import { StateContext } from '../State';
import { Button, Card, Input, Typography } from '@mui/joy';
import { App } from '../../common/types';
import { flow } from 'effect';
import { getTargetValue } from '../../common/utils';
import { issueInstruction } from '../../common/api';

type Props = {
  controlState: Extract<App, { kind: 'control' }>;
};

export const Control: React.FC<Props> = ({ controlState }) => {
  const appState = useContext(StateContext);
  const [instruction, setInstruction] = useState('');
  const imInCharge = appState.nickname === controlState.controlPlayer.nickname;

  return imInCharge ? (
    <>
      <Card>
        <Typography>ur in charge</Typography>
        <Input
          value={instruction}
          onChange={flow(getTargetValue, setInstruction)}
        />
        <Button onClick={() => issueInstruction({ instruction })}>
          try to do this
        </Button>
      </Card>
    </>
  ) : (
    <Card>{`${controlState.controlPlayer.nickname} is controlling John`}</Card>
  );
};
