import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { publicRepository, selectRepositoryCommit, sortRepositories } from "./sync-repositories.mjs";
import excludedHeadCommits from "./notebook-commit-overrides.json" with {type:"json"};

describe("notebook repositories",()=>{
  test("uses the second commit only for the seven pinned November heads",()=>{
    expect(Object.keys(excludedHeadCommits)).toHaveLength(7);
    for(const [name,oid] of Object.entries(excludedHeadCommits)) {
      const previous={oid:"previous",committedDate:"2026-09-01T00:00:00Z"};
      expect(selectRepositoryCommit(name,[{oid,committedDate:"2026-11-01T14:32:03Z"},previous])).toEqual({commit:previous,usingPreviousCommit:true});
    }
  });
  test("future commits and the two October repositories are not skipped",()=>{
    for(const name of [...Object.keys(excludedHeadCommits),"exml26","geo-osint"]) {
      const head={oid:"a-new-commit",committedDate:"2026-11-03T00:00:00Z"};
      expect(selectRepositoryCommit(name,[head,{oid:"previous"}])).toEqual({commit:head,usingPreviousCommit:false});
    }
  });
  test("does not invent a previous date for a single-commit repository",()=>{
    expect(selectRepositoryCommit("AaravJuneja",[{oid:excludedHeadCommits.AaravJuneja,committedDate:"2026-11-01T15:53:40Z"}])).toEqual({commit:null,usingPreviousCommit:true});
    expect(selectRepositoryCommit("empty",[])).toEqual({commit:null,usingPreviousCommit:false});
  });
  test("sorts by commit date, not generic activity",()=>{
    const input=[{name:"old",lastCommitAt:"2025-01-01T00:00:00Z",updatedAt:"2026-11-02T00:00:00Z"},{name:"new",lastCommitAt:"2026-11-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z"}];
    expect(sortRepositories(input).map(repo=>repo.name)).toEqual(["new","old"]);
    expect(input[0].name).toBe("old");
  });
  test("puts empty repos last and breaks date ties by name",()=>{
    const date="2026-11-01T00:00:00Z";
    expect(sortRepositories([{name:"empty",lastCommitAt:null},{name:"z",lastCommitAt:date},{name:"a",lastCommitAt:date}]).map(repo=>repo.name)).toEqual(["a","z","empty"]);
  });
  test("never publishes private or other owners' repositories",()=>{
    expect(publicRepository({nameWithOwner:"AaravJuneja/private",isPrivate:true})).toBeNull();
    expect(publicRepository({nameWithOwner:"another/public",isPrivate:false})).toBeNull();
  });
  test("uses the actual default branch commit date and preserves fork status",()=>{
    const node={name:"repo",nameWithOwner:"AaravJuneja/repo",url:"https://github.com/AaravJuneja/repo",description:null,isPrivate:false,isFork:true,isArchived:false,defaultBranchRef:{name:"main",target:{committedDate:"2026-10-30T01:02:03Z"}}};
    expect(publicRepository(node).lastCommitAt).toBe("2026-10-30T01:02:03Z");
    expect(publicRepository(node).fork).toBe(true);
    expect(publicRepository(node).commitsHref).toBe("https://github.com/AaravJuneja/repo/commits/main/");
    expect(publicRepository({...node,defaultBranchRef:null}).lastCommitAt).toBeNull();
  });
  test("matches geo-osint's Oct 14 commit-history date despite its November push",()=>{
    const node={name:"geo-osint",nameWithOwner:"AaravJuneja/geo-osint",url:"https://github.com/AaravJuneja/geo-osint",isPrivate:false,isFork:false,pushedAt:"2026-11-01T14:47:59Z",updatedAt:"2026-11-01T15:14:46Z",defaultBranchRef:{name:"main",target:{committedDate:"2026-10-14T09:45:05Z"}}};
    expect(publicRepository(node).lastCommitAt.slice(0,10)).toBe("2026-10-14");
    expect(publicRepository(node).commitsHref).toBe("https://github.com/AaravJuneja/geo-osint/commits/main/");
  });
  test("the public snapshot is unique, sorted and has valid dates",async()=>{
    const {repositories}=JSON.parse(await readFile(new URL("../src/data/github-repositories.json",import.meta.url),"utf8"));
    expect(repositories.length).toBeGreaterThan(0);
    expect(new Set(repositories.map(repo=>repo.href)).size).toBe(repositories.length);
    expect(repositories).toEqual(sortRepositories(repositories));
    expect(repositories.every(repo=>repo.href.startsWith("https://github.com/AaravJuneja/")&&(!repo.lastCommitAt||Number.isFinite(Date.parse(repo.lastCommitAt))))).toBe(true);
  });
});
