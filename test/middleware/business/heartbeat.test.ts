import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { IlpPrepare, IlpReply, deserializeIlpFulfill, IlpReject, IlpFulfill, isFulfill } from 'ilp-packet'
import { HeartbeatMiddleware } from '../../../src/middleware/business/heartbeat'
import { setPipelineReader } from '../../../src/types/middleware';
import MockIlpEndpoint from '../../mocks/mockIlpEndpoint';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Heartbeat Middleware', function () {
  const heartbeatPacket: IlpPrepare = {
    amount: '52',
    executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
    expiresAt: new Date(1434412800000 + 2000),
    destination: 'peer.heartbeat',
    data: Buffer.alloc(0)
  }
  const rejectPacket: IlpReject = {
    message: 'test',
    triggeredBy: 'test middleware',
    code: 'Test',
    data: Buffer.alloc(0)
  }

  beforeEach(function () {
    this.clock = sinon.useFakeTimers()
  })

  afterEach(function () {
    this.clock.restore()
  })

  it('intercepts peer.heartbeat messages', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => rejectPacket)
    const heartbeatMiddleware = new HeartbeatMiddleware({
      endpoint,
      onSuccessfullHeartbeat: () => {},
      onFailedHeartbeat: () => {},
    })
    let didNotIntercept = false
    const incomingPipeline = setPipelineReader('incoming', heartbeatMiddleware, async (packet: IlpPrepare) => {
      didNotIntercept = true
      return rejectPacket
    })

    await incomingPipeline(heartbeatPacket)

    assert.isNotOk(didNotIntercept)
  })

  it('replies with fulfill packet to peer.heartbeat messages', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => rejectPacket)
    const heartbeatMiddleware = new HeartbeatMiddleware({
      endpoint,
      onSuccessfullHeartbeat: () => {},
      onFailedHeartbeat: () => {},
    })
    const incomingPipeline = setPipelineReader('incoming', heartbeatMiddleware, async (packet: IlpPrepare) => rejectPacket)

    const reply = await incomingPipeline(heartbeatPacket)

    assert.isOk(isFulfill(reply))
  })

  it('starts heartbeat to test when the endpoint is able to start sending packets again', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => rejectPacket)
    const endpointSendSpy = sinon.spy(endpoint, 'sendOutgoingRequest')
    const heartbeatMiddleware = new HeartbeatMiddleware({
      endpoint,
      onSuccessfullHeartbeat: () => {},
      onFailedHeartbeat: () => {},
    })

    heartbeatMiddleware.startup() 
    this.clock.tick(30000) // one default heartbeat interval
    this.clock.tick(30000) // next heartbeat interval

    sinon.assert.calledTwice(endpointSendSpy)
    assert.equal(endpointSendSpy.args[0][0].destination, 'peer.heartbeat')
    assert.equal(endpointSendSpy.args[1][0].destination, 'peer.heartbeat')
  })

  it('calls addPeer when the heartbeat is successfull', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => rejectPacket)
    endpoint.connected = true
    let peerAdded = true
    const heartbeatMiddleware = new HeartbeatMiddleware({
      endpoint,
      onSuccessfullHeartbeat: () => {peerAdded = true},
      onFailedHeartbeat: () => {},
    })

    heartbeatMiddleware.startup()    
    this.clock.tick(30000) // one default heartbeat interval

    assert.isOk(peerAdded)
  })

  it('calls removePeer when the heartbeat fails', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => rejectPacket)
    endpoint.connected = false
    let peerRemoved = false
    const heartbeatMiddleware = new HeartbeatMiddleware({
      endpoint,
      onSuccessfullHeartbeat: () => {},
      onFailedHeartbeat: () => {peerRemoved = true},
    })

    heartbeatMiddleware.startup()
    this.clock.tick(30000) // one default heartbeat interval

    assert.isOk(peerRemoved)
  })

  it('shutdown clears heartbeat', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => rejectPacket)
    const endpointSendSpy = sinon.spy(endpoint, 'sendOutgoingRequest')
    const heartbeatMiddleware = new HeartbeatMiddleware({
      endpoint,
      onSuccessfullHeartbeat: () => {},
      onFailedHeartbeat: () => {},
    })

    heartbeatMiddleware.startup()
    heartbeatMiddleware.shutdown()
    this.clock.tick(60000) // two default heartbeat interval

    sinon.assert.notCalled(endpointSendSpy)
  })
})