import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import excludedHeadCommits from "./notebook-commit-overrides.json" with { type: "json" };

const owner = "AaravJuneja";
const output = new URL("../src/data/github-repositories.json", import.meta.url);
const query = `query($owner:String!,$cursor:String){user(login:$owner){repositories(first:100,after:$cursor,privacy:PUBLIC,ownerAffiliations:[OWNER],orderBy:{field:NAME,direction:ASC}){pageInfo{hasNextPage endCursor}nodes{name nameWithOwner url description isPrivate isFork isArchived defaultBranchRef{name target{... on Commit{oid committedDate history(first:2){nodes{oid committedDate}}}}}}}}}`;

export function selectRepositoryCommit(name,commits) {
  const usingPreviousCommit=Boolean(commits[0]?.oid && excludedHeadCommits[name]===commits[0].oid);
  return {commit:commits[usingPreviousCommit?1:0]??null,usingPreviousCommit};
}

export function sortRepositories(repositories) {
  return repositories.toSorted((a,b) => {
    const dateA = a.lastCommitAt ? Date.parse(a.lastCommitAt) : -Infinity;
    const dateB = b.lastCommitAt ? Date.parse(b.lastCommitAt) : -Infinity;
    return (dateB-dateA) || a.name.localeCompare(b.name,"en");
  });
}

export function publicRepository(node) {
  if (node.isPrivate !== false || !node.nameWithOwner?.toLowerCase().startsWith(`${owner.toLowerCase()}/`)) return null;
  const target=node.defaultBranchRef?.target;
  const {commit,usingPreviousCommit}=selectRepositoryCommit(node.name,target?.history?.nodes ?? (target?[target]:[]));
  return { name:node.name, href:node.url, description:node.description, fork:node.isFork, archived:node.isArchived, lastCommitAt:commit?.committedDate ?? null, usingPreviousCommit, commitHref:commit?.oid ? `${node.url}/commit/${commit.oid}` : null, commitsHref:node.defaultBranchRef?.name ? `${node.url}/commits/${encodeURIComponent(node.defaultBranchRef.name)}/` : null };
}

async function request(url,options={},allowEmpty=false) {
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(15000),headers:{Accept:"application/vnd.github+json","User-Agent":"juneja-portfolio",...options.headers}});
  if(allowEmpty && response.status===409)return [];
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}

async function graphqlRepositories() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repositories = [];
  let cursor = null;
  do {
    let result;
    if (token) {
      result = await request("https://api.github.com/graphql",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({query,variables:{owner,cursor}})});
    } else {
      const args=["api","graphql","-f",`query=${query}`,"-f",`owner=${owner}`];
      if(cursor)args.push("-f",`cursor=${cursor}`);
      result=JSON.parse(execFileSync("gh",args,{encoding:"utf8",timeout:20000,stdio:["ignore","pipe","ignore"]}));
    }
    if (result.errors) throw new Error("GitHub query failed");
    const connection = result.data?.user?.repositories;
    if (!connection) throw new Error("GitHub account unavailable");
    repositories.push(...connection.nodes.map(publicRepository).filter(Boolean));
    const next = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    if (next && next === cursor) throw new Error("GitHub pagination did not advance");
    cursor = next;
  } while(cursor);
  return repositories;
}

async function restRepositories() {
  const repositories=[];
  for(let page=1;;page++) {
    const batch=await request(`https://api.github.com/users/${owner}/repos?per_page=100&type=owner&sort=full_name&page=${page}`);
    if(!Array.isArray(batch))throw new Error("Invalid repository response");
    repositories.push(...batch.filter(repo=>repo.private===false&&repo.owner?.login?.toLowerCase()===owner.toLowerCase()));
    if(batch.length<100)break;
  }
  const result=[];
  for(let i=0;i<repositories.length;i+=4) {
    result.push(...await Promise.all(repositories.slice(i,i+4).map(async repo=>{
      const commits=await request(`https://api.github.com/repos/${owner}/${encodeURIComponent(repo.name)}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=2`,{},true);
      if(!Array.isArray(commits)||commits.some(commit=>!commit?.commit?.committer?.date))throw new Error("Commit date unavailable");
      const {commit,usingPreviousCommit}=selectRepositoryCommit(repo.name,commits.map(entry=>({oid:entry.sha,committedDate:entry.commit.committer.date})));
      const lastCommitAt=commit?.committedDate ?? null;
      return {name:repo.name,href:repo.html_url,description:repo.description,fork:repo.fork,archived:repo.archived,lastCommitAt,usingPreviousCommit,commitHref:commit?.oid ? `${repo.html_url}/commit/${commit.oid}` : null,commitsHref:repo.default_branch ? `${repo.html_url}/commits/${encodeURIComponent(repo.default_branch)}/` : null};
    })));
  }
  return result;
}

export async function syncRepositories() {
  try {
    const repositories=sortRepositories(await graphqlRepositories().catch(()=>restRepositories()));
    if(!repositories.length)throw new Error("GitHub returned no public repositories");
    const unique=[...new Map(repositories.map(repo=>[repo.href,repo])).values()];
    await mkdir(new URL("../src/data/",import.meta.url),{recursive:true});
    const temporary=new URL("../src/data/github-repositories.json.tmp",import.meta.url);
    await writeFile(temporary,`${JSON.stringify({owner,fetchedAt:new Date().toISOString(),repositories:unique},null,2)}\n`);
    await rename(temporary,output);
    console.log(`Synced ${unique.length} public GitHub repositories with notebook commit-date overrides.`);
  } catch {
    const cached=JSON.parse(await readFile(output,"utf8"));
    if(!Array.isArray(cached.repositories)||!cached.repositories.length)throw new Error("No repository snapshot available");
    console.warn(`GitHub unavailable; using ${cached.repositories.length} cached public repositories.`);
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url))await syncRepositories();
