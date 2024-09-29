import { FC, useContext, useEffect, useRef, useState } from 'react';
import { client } from '../zoom';
import { StateContext } from '../State';
import { Stream, VideoPlayer, VideoQuality } from '@zoom/videosdk';
import { Box, Card, Stack, Typography } from '@mui/joy';
import ReactDice from 'react-dice-complete';
import ElectricBolt from '@mui/icons-material/ElectricBolt';
import { getPlayersFull } from '../../common/utils';

type Props = {
  nickname: string;
};

const Player: FC<Props> = ({ nickname }) => {
  const { nickname: appNickname, ...appState } = useContext(StateContext);
  const streamRef = useRef<typeof Stream | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [trigger, setTrigger] = useState(0);

  const playerInTie =
    appState.kind === 'biddingTie' &&
    appState.players.find(u => u.nickname === nickname);

  const playerNotInLobby =
    appState.kind !== 'waitingLobby' &&
    appState.kind !== 'pickingPeriod' &&
    getPlayersFull(appState).find(u => u.nickname);

  useEffect(() => {
    client.on('peer-video-state-change', () => {
      setTrigger(n => n + 1);
    });
  }, []);

  useEffect(() => {
    if (appNickname === null) {
      return;
    }

    if (appNickname === nickname && trigger === 0) {
      const stream = client.getMediaStream();
      streamRef.current = stream;
      console.log(client.getAllUser());
      stream.startAudio();
      stream.startVideo().then(() => {
        stream
          .attachVideo(
            client.getCurrentUserInfo().userId,
            VideoQuality.Video_360P,
          )
          .then(userVideo => {
            containerRef.current?.appendChild(userVideo as VideoPlayer);
          });
      });
    } else {
      const participant = client
        .getAllUser()
        .filter(u => u.displayName === nickname)[0];
      if (!participant) return;
      const stream = client.getMediaStream();
      stream
        .attachVideo(participant.userId, VideoQuality.Video_360P)
        .then(userVideo => {
          containerRef.current?.appendChild(userVideo as VideoPlayer);
        });
    }
  }, [appNickname, trigger]);
  return (
    <Box
      my={5}
      width="300px"
      style={{
        // filter: 'drop-shadow(5px 5px 8px #DDDDDD)',
        position: 'relative',
      }}
    >
      {playerInTie &&
        playerInTie.tieStatus.kind === 'tie' &&
        playerInTie.tieStatus.roll && (
          <Card
            sx={{ position: 'absolute', top: '-100px', left: '107px', p: 1 }}
          >
            <ReactDice
              numDice={1}
              defaultRoll={playerInTie.tieStatus.roll}
              rollDone={() => {}}
              faceColor={'#b0d2ff'}
              dotColor={'#ffffff'}
              outlineColor={'#97abc4'}
              dieSize={30}
              outline
              disableIndividual
            />
          </Card>
        )}
      <Box
        style={{
          width: '300px',
          height: '275px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '15px',
        }}
        sx={
          {
            // boxShadow: 'xl',
          }
        }
        mx="auto"
      >
        {/* @ts-expect-error */}
        <video-player-container
          ref={containerRef}
          /* @ts-expect-error */
        ></video-player-container>
      </Box>
      <Card
        sx={{
          marginTop: '-50px',
          width: '300px',
          boxSizing: 'border-box',
          borderTopRightRadius: 0,
          borderTopLeftRadius: 0,
          // filter: 'drop-shadow(5px 8px 12px #000000)',
        }}
      >
        <Stack flexDirection="row" alignItems="center">
          <Typography level="h3" sx={{ flexGrow: 1 }}>
            {nickname}
          </Typography>
          {playerNotInLobby && <ElectricBolt fontSize="small" />}
          {playerNotInLobby && (
            <Typography>{playerNotInLobby.willpower}</Typography>
          )}
        </Stack>
      </Card>
    </Box>
  );
};

export default Player;
