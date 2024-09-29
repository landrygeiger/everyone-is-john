import { Box, Button, Card, Stack, Typography } from '@mui/joy';
import {
  FC,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import ReactDice, { ReactDiceRef } from 'react-dice-complete';
import { submitTieRoll } from '../../common/api';
import { StateContext } from '../State';
import { namesToListStr } from '../../common/utils';

const BreakTie: FC = () => {
  const appState = useContext(StateContext);
  const reactDice = useRef<ReactDiceRef>(null);
  const [clickedSubmit, setClickedSubmit] = useState(false);
  const involvesMe =
    appState.kind === 'biddingTie' &&
    appState.players.find(
      u => u.nickname === appState.nickname && u.tieStatus.kind === 'tie',
    );

  const roll = () => {
    reactDice.current?.rollAll();
    setClickedSubmit(true);
  };

  const rollDone = async (total: number) => {
    console.log('roll done!');
    if (!appState.nickname) return;
    if (!clickedSubmit) return;
    await submitTieRoll({
      nickname: appState.nickname,
      roll: total,
    });
  };

  useEffect(() => {
    if (appState.kind !== 'biddingTie') return;

    // If the state changes and everyone who needs to roll hasn't yet rolled,
    // then a new round of tie breaking has begun and we need to undisabled
    // the dice if it was disabled
    if (
      appState.players.filter(
        p => p.tieStatus.kind === 'tie' && p.tieStatus.roll !== null,
      ).length === 0
    ) {
      setClickedSubmit(false);
    }
  }, [appState]);

  return (
    <Card sx={{ p: 5, maxWidth: '350px' }}>
      <Typography level="h1">There was a tie!</Typography>
      <Typography>
        A bidding tie has occurred between{' '}
        {namesToListStr(
          appState.kind === 'biddingTie'
            ? appState.players
                .filter(p => p.tieStatus.kind === 'tie')
                .map(p => p.nickname)
            : [],
        )}
        . This must be settled!
      </Typography>
      {involvesMe ? (
        <Stack>
          <Box
            sx={{
              my: 5,
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
            Roll
          </Button>
        </Stack>
      ) : (
        <Typography>Sit tight while they hash it out...</Typography>
      )}
    </Card>
  );
};

export default BreakTie;
