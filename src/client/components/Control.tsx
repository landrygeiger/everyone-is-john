import React, {
  FormEventHandler,
  useContext,
  useEffect,
  useState,
} from 'react';
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
  const [disabled, setDisabled] = useState(false);
  const imInCharge = appState.nickname === controlState.controlPlayer.nickname;

  useEffect(() => {
    setDisabled(false);
    setInstruction('');
  }, [appState]);

  const onSubmit: FormEventHandler = e => {
    e.preventDefault();
    setDisabled(true);
    issueInstruction({ instruction });
  };

  return imInCharge ? (
    <>
      <Card style={{ width: '350px' }} sx={{ p: 5 }}>
        <Typography level="h1">You're in Charge</Typography>
        <Typography>
          As the disembodied voice in control, make yourself heard and influence
          John's next move.
        </Typography>
        <form
          onSubmit={onSubmit}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <Input
            value={instruction}
            onChange={flow(getTargetValue, setInstruction)}
            placeholder="Prompt"
            disabled={disabled}
            sx={{ marginTop: 3 }}
          />
          <Button
            onClick={() => {
              issueInstruction({ instruction });
              setDisabled(true);
            }}
            sx={{ marginTop: 2, alignSelf: 'flex-end' }}
            disabled={disabled}
            type="submit"
          >
            Influence
          </Button>
        </form>
      </Card>
    </>
  ) : (
    <Card sx={{ p: 5 }}>
      <Typography level="h1">{`${controlState.controlPlayer.nickname} is controlling John`}</Typography>
      <Typography>
        Another player is influencing John. Wait for their turn to be over for a
        chance yourself.
      </Typography>
    </Card>
  );
};
