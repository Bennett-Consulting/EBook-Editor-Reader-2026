import { chunksDao } from '../../src/lib/db';
import { DocumentChunk } from '../../src/lib/types';

const createMockDb = () => {
  const runAsync = jest.fn();
  const getAllAsync = jest.fn();
  const getFirstAsync = jest.fn();
  const withTransactionAsync = jest.fn(async (callback: any) => await callback());

  return { runAsync, getAllAsync, getFirstAsync, withTransactionAsync } as any;
};

describe('chunksDao', () => {
  let db: any;

  beforeEach(() => {
    db = createMockDb();
  });

  it('loadWindow calls getAllAsync with correct query', async () => {
    db.getAllAsync.mockResolvedValue([]);
    await chunksDao.loadWindow(db, 'doc-1', 10);
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['doc-1', 5, 20]
    );
  });

  it('getCount returns count from getFirstAsync', async () => {
    db.getFirstAsync.mockResolvedValue({ cnt: 42 });
    const result = await chunksDao.getCount(db, 'doc-1');
    expect(result).toBe(42);
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('COUNT'),
      ['doc-1']
    );
  });

  it('bulkInsert uses transaction and deletes old chunks', async () => {
    const chunks: Omit<DocumentChunk, 'id'>[] = [
      {
        documentId: 'doc-1',
        chunkIndex: 0,
        rawContent: 'Hello',
        cleanContent: 'Hello',
        mappingJson: '{}',
        timestamp: Date.now(),
      },
    ];
    await chunksDao.bulkInsert(db, 'doc-1', chunks);
    expect(db.withTransactionAsync).toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE'),
      ['doc-1']
    );
  });

  it('updateContent updates clean_content and raw_content', async () => {
    await chunksDao.updateContent(db, 'doc-1', 5, 'New content');
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      expect.arrayContaining(['New content', 'doc-1', 5])
    );
  });

  it('deleteAllFollowing deletes chunks from index onward', async () => {
    await chunksDao.deleteAllFollowing(db, 'doc-1', 10);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM document_chunks WHERE document_id = ? AND chunk_index >= ?'),
      ['doc-1', 10]
    );
  });

  it('shiftIndicesDown decrements indices after given index', async () => {
    await chunksDao.shiftIndicesDown(db, 'doc-1', 5, 1);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE document_chunks SET chunk_index = chunk_index - ?'),
      [1, 'doc-1', 5]
    );
  });
});
