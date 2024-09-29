import { FC, useState } from 'react';
import { Button, Card, Link, Stack, Typography } from '@mui/joy';
import { startGame } from '../../common/api';
import { App } from '../../common/types';
import AnimatedText from './AnimatedText';

type Props = {
  lobbyState: Extract<App, { kind: 'waitingLobby' }>;
};

const titleKeyframes = [
  'Welcome to the Lobby',
  'Welcome to the Lobby.',
  'Welcome to the Lobby..',
  'Welcome to the Lobby...',
];

const Lobby: FC<Props> = ({ lobbyState }) => {
  const [disabled, setDisabled] = useState(false);
  const onClick = async () => {
    setDisabled(false);
    await startGame();
  };
  return (
    <Card sx={{ width: '600px' }}>
      <AnimatedText
        keyframes={titleKeyframes}
        periodMs={1000}
        typographyLevel="h1"
      />
      <Typography>
        At least two players are required to start. In the meantime, feel free
        to brush up on the{' '}
        <Link href="https://rtwolf.github.io/Everyone-is-John/">rules</Link>.
      </Typography>
      <Stack>
        <Button
          disabled={disabled || lobbyState.players.length < 2}
          onClick={onClick}
          sx={{ alignSelf: 'flex-end' }}
        >
          Start Game
        </Button>
      </Stack>
    </Card>
  );
};

export default Lobby;
