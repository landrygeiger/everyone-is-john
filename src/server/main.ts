import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { CLIENT_ORIGIN, SERVER_PORT } from '../common/config';
import { App } from '../common/types';
import { Mutex } from 'async-mutex';
import {
  attemptSkillCheck,
  maybeFinishBidding,
  maybeFinishPicking,
  maybeFinishTieRoll,
  playerBid,
  playerJoinLobby,
  playerSkillObsessionSelect,
  playerSubmitTieRoll,
  UpdateAppState,
  userIssuesControlInstruction,
  waitingToPicking,
} from '../common/transitions';
import {
  AttemptSkillCheckRequest,
  IssueInstructionRequest,
  JoinLobbyRequest,
  KitSelectRequest,
  PlayerBidRequest,
  PlayerTieRollRequest,
} from '../common/api';
import { getJWT } from './zoom';
import { callStableImage } from './awsImageCall';
import { callClaudeConverse } from './awsClaudeConverse';

const app = express();
const port = SERVER_PORT;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
  },
});

let state: App = { kind: 'waitingLobby', players: [] };
const stateMutex = new Mutex();
const setState = async (getNewState: UpdateAppState) => {
  const release = await stateMutex.acquire();
  state = await getNewState(state);
  io.emit('message', state);
  release();
};

app.use(
  cors({
    origin: CLIENT_ORIGIN,
  }),
);

app.use(express.json());

app.post('/api/join', async (req, res) => {
  const { nickname } = req.body as JoinLobbyRequest;
  await setState(playerJoinLobby(nickname));
  console.log(`Player sent join request with nickname "${nickname}".`);
  res.sendStatus(200);
});

app.post('/api/start', async (_, res) => {
  await setState(waitingToPicking());
  console.log('Starting game.');
  res.sendStatus(200);
});

app.post('/api/selectKit', async (req, res) => {
  const { nickname, skillOne, skillTwo, obsession } =
    req.body as KitSelectRequest;
  await setState(
    playerSkillObsessionSelect(nickname, skillOne, skillTwo, obsession),
  );
  console.log(`kit selected: ${JSON.stringify(req.body)}`);
  await setState(maybeFinishPicking());
  res.sendStatus(200);
});

app.post('/api/playerBid', async (req, res) => {
  const { nickname, bidAmt } = req.body as PlayerBidRequest;
  await setState(playerBid(nickname, bidAmt));
  console.log(`${nickname} bid ${bidAmt}`);
  await setState(maybeFinishBidding());
  res.sendStatus(200);
});

app.post('/api/playerTieRoll', async (req, res) => {
  const { nickname, roll } = req.body as PlayerTieRollRequest;
  await setState(playerSubmitTieRoll(nickname, roll));
  console.log(`${nickname} rolled ${roll}`);
  await setState(maybeFinishTieRoll());
  res.sendStatus(200);
});

app.post('/api/issueInstruction', async (req, res) => {
  const { instruction } = req.body as IssueInstructionRequest;
  await setState(userIssuesControlInstruction(instruction));
  console.log(`active Voice issued instruction: ${instruction}`);
  res.sendStatus(200);
});

app.post('/api/attemptSkillCheck', async (req, res) => {
  const { willpowerAdded, rollResult } = req.body as AttemptSkillCheckRequest;
  await setState(attemptSkillCheck(willpowerAdded, rollResult));
  console.log(`attempted skill check: ${rollResult} + ${willpowerAdded}`);
  res.sendStatus(200);
});

app.get('/api/zoom-jwt', async (_, res) => {
  res.send({ jwt: await getJWT() });
});

io.on('connection', socket => {
  console.log(`Socket with id ${socket.id} has connected.`);
  socket.send(state);

  socket.on('disconnect', () => {
    console.log(`Socket with id ${socket.id} has disconnected.`);
  });
});

server.listen(port, () => {
  console.log(`App is listening on port ${port}...`);
});

callClaudeConverse(
  [
    `John opens his eyes and finds himself in the backseat of a moving car. He blinks, disoriented, as he takes in his unfamiliar surroundings. The car is speeding down a busy city street, horns blaring and tires screeching as it weaves through traffic. John sits up, his eyes wide with confusion, and peers out the window, trying to get his bearings. In the front seat, he can see two figures arguing heatedly, their voices raised. John doesn't recognize them, but they seem to be in the midst of some sort of high-stakes situation. As the car careens around a sharp turn, John clutches the door handle, his heart racing. Where is he, and how did he end up here? The possibilities are endless, and John can't help but feel a tingle of excitement at the prospect of unraveling this mystery.`,
    `CONTEST: Landry won the contest, and took control of John.`,
    `John grips the door handle as the car careens through the city streets. Confusion and excitement swirl within him. Who are these people, and what is their high-stakes situation? John's head spins with the possibilities. What do you do?`,
    `INSTRUCTION: I want to stop the car\nPLAYER DETAILS:\nSkills: diving, yelling\nObsession: eating icecream`,
  ],
  `You are generating a TypeScript type that determines the next state of a ttrpg game of “Everyone is John.” Using the provided player instructions, generate the Game Master’s response, in the following format, specifying the Game Master’s description and the ensuing result. {description: string; result: | { kind: 'skillCheckWithAdvantage' } | { kind: 'skillCheck' } | { kind: 'okayNext' } | { kind: 'fallAsleep' } | { kind: 'obsessionsCompleted'; playerNicknames: string[] };}; For uncertain tasks that require some skill to accomplish, you should prompt the player for a skill check. If they have skills unrelated to the task, the result should be a skillCheck, otherwise the result will be skillCheckWithAdvantage if one of their skills applies. If there is no skillCheck required, determine if the task results in any completed obsessions by returning an obsessionCompleted result with the player(s) who completed their obsession. If no obsessions are completed and no skillcheck is required, return an okayNext result. Your output must be this exact format with no other text: {description: string; result: | { kind: 'skillCheckWithAdvantage' } | { kind: 'skillCheck' } | { kind: 'okayNext' } | { kind: 'fallAsleep' } | { kind: 'obsessionsCompleted'; playerNicknames: string[] };};`,
).then(console.log);
