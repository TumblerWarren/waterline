import { describe, expect, it, vi } from 'vitest';
import { acknowledgeNotification } from '../src/notificationAcknowledgement';

const episode = 'a'.repeat(32);
const id = `tank:80:${episode}`;

describe('notification acknowledgement', () => {
  it('submits the displayed episodes before dismissing only those phone alarms', async () => {
    const order: string[] = [];
    const request = vi.fn(async () => {
      order.push('request');
    });
    const finish = vi.fn(async () => {
      order.push('finish');
    });
    await acknowledgeNotification([id], request, finish);
    expect(request).toHaveBeenCalledWith('/api/alarms/ack', 'POST', {
      alarms: [{ level: 80, episode }],
    });
    expect(finish).toHaveBeenCalledWith({ ids: [id] });
    expect(order).toEqual(['request', 'finish']);
  });

  it('keeps the phone alert when the board request fails or the episode has changed', async () => {
    const finish = vi.fn();
    await expect(
      acknowledgeNotification(
        [id],
        async () => {
          throw new Error('This alarm has changed. Refresh and try again.');
        },
        finish,
      ),
    ).rejects.toThrow('This alarm has changed');
    expect(finish).not.toHaveBeenCalled();
  });

  it('dismisses phone tests without sending a board command', async () => {
    const request = vi.fn();
    const finish = vi.fn();
    const test = `phone-test:20:${episode}`;
    await acknowledgeNotification([test], request, finish);
    expect(request).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith({ ids: [test] });
  });
});
