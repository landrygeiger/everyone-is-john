import { useContext, useRef, useState } from 'react';
import { App } from '../../common/types';
import { StateContext } from '../State';
import { Box, Button, Card, Slider, Typography } from '@mui/joy';
import { attemptSkillCheck } from '../../common/api';
import ReactDice, { ReactDiceRef } from 'react-dice-complete';

type Props = {
  skillCheckState: Extract<App, { kind: 'skillCheck' }>;
};

export const SkillCheck: React.FC<Props> = ({ skillCheckState }) => {
  const appState = useContext(StateContext);
  const [willpowerToAdd, setWillpowerToAdd] = useState(0);
  const [clickedSubmit, setClickedSubmit] = useState(false);
  const imInCharge =
    appState.nickname === skillCheckState.controlPlayer.nickname;
  const maxWillpowerToAdd = skillCheckState.controlPlayer.willpower;
  const reactDice = useRef<ReactDiceRef>(null);

  const roll = () => {
    reactDice.current?.rollAll();
    setClickedSubmit(true);
  };

  const rollDone = async (total: number) => {
    if (!appState.nickname) return;
    if (!clickedSubmit) return;
    attemptSkillCheck({ rollResult: total, willpowerAdded: willpowerToAdd });
  };

  const rollNeeded = Math.max(
    (skillCheckState.advantage ? 4 : 6) - willpowerToAdd,
    1,
  );

  return imInCharge ? (
    <>
      <Card sx={{ width: '450px' }}>
        <Typography level="h1">Skill Check</Typography>
        <Typography>
          You must pass a skill check to succeed in your influence. Spending
          Willpower increases your chance of success.
        </Typography>
        {skillCheckState.advantage && (
          <Typography>
            {skillCheckState.advantage
              ? 'You have advantage because of your skills. '
              : ''}
            To succeed, you must roll{' '}
            {rollNeeded === 6 ? 'a 6.' : 'at least a ' + rollNeeded}
          </Typography>
        )}
        <Slider
          value={willpowerToAdd}
          onChange={(_, newValue) => setWillpowerToAdd(newValue as number)}
          min={0}
          max={maxWillpowerToAdd}
          step={1}
          valueLabelDisplay="auto"
          marks
          sx={{
            '--Slider-markSize': '4px',
            '--Slider-thumbSize': '22px',
            maxWidth: '300px',
            mx: 'auto',
          }}
          disabled={clickedSubmit}
        />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <ReactDice
            numDice={1}
            ref={reactDice}
            rollDone={rollDone}
            rollTime={3}
            faceColor={'#b0d2ff'}
            dotColor={'#ffffff'}
            outlineColor={'#97abc4'}
            outline
            disableIndividual
          />
        </Box>
        <Button onClick={roll} disabled={clickedSubmit}>
          {`Roll with ${willpowerToAdd} Willpower`}
        </Button>
      </Card>
    </>
  ) : (
    <Card>{`${skillCheckState.controlPlayer.nickname} is doing a skill check`}</Card>
  );
};
