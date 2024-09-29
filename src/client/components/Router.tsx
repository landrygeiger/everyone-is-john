import { FC, useContext } from 'react';
import { StateContext } from '../State';
import { match, P } from 'ts-pattern';
import Lobby from './Lobby';
import { Box, Card, Stack, Typography } from '@mui/joy';
import JoinLobby from './JoinLobby';
import { getPlayers } from '../../common/utils';
import Player from './Player';
import Picking from './Picking';
import BreakTie from './BreakTie';
import Bidding from './Bidding';
import { Control } from './Control';
import { SkillCheck } from './SkillCheck';

const Router: FC = () => {
  const appState = useContext(StateContext);

  return (
    <Stack sx={{ height: '100%' }}>
      <Box
        flexGrow={1}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
          gap: 10,
        }}
      >
        {(appState.kind === 'bidding' ||
          appState.kind === 'biddingTie' ||
          appState.kind === 'control' ||
          appState.kind === 'skillCheck') && (
          <Stack flexDirection="column" alignItems="center">
            {appState.imageURL && (
              <Card
                sx={{
                  width: '350px',
                  marginTop: 1,
                  backgroundColor: 'transparent',
                  borderColor: 'transparent',
                }}
              >
                <img
                  style={{ paddingTop: 1, borderRadius: '10px' }}
                  src={appState.imageURL}
                />
              </Card>
            )}
            {appState.history.length > 0 && (
              <Card
                sx={{
                  width: '600px',
                  height: '100%',
                  marginTop: '-130px',
                  p: 4,
                }}
              >
                <Typography>
                  {appState.history[appState.history.length - 1]}
                </Typography>
              </Card>
            )}
          </Stack>
        )}
        {match(appState)
          .with(
            {
              kind: 'waitingLobby',
              nickname: P.when(
                () =>
                  appState.kind === 'waitingLobby' &&
                  appState.players.filter(
                    player => player.nickname === appState.nickname,
                  ).length !== 0,
              ),
            },
            appState => <Lobby lobbyState={appState} />,
          )
          .with({ kind: 'waitingLobby', nickname: P.nullish }, () => (
            <JoinLobby />
          ))
          .with({ kind: 'pickingPeriod' }, pickingState => (
            <Picking pickingState={pickingState} />
          ))
          .with({ kind: 'bidding' }, () => <Bidding />)
          .with({ kind: 'biddingTie' }, () => <BreakTie />)
          .with({ kind: 'control' }, controlState => (
            <Control controlState={controlState} />
          ))
          .with({ kind: 'skillCheck' }, skillCheckState => (
            <SkillCheck skillCheckState={skillCheckState} />
          ))
          .otherwise(appState => (
            <Typography level="body-md">{appState.kind}</Typography>
          ))}
      </Box>
      {appState.nickname !== null && (
        <Stack
          justifyContent="space-around"
          flexDirection="row"
          alignItems="flex-end"
        >
          {getPlayers(appState).map(player => (
            <Player key={player.nickname} nickname={player.nickname} />
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default Router;
