// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Voting {
    address public admin;

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    Candidate[] public candidates;

    mapping(address => bool) public isVerified;
    mapping(address => bool) public hasVoted;

    event VoterVerified(address indexed voter);
    event VoteCasted(address indexed voter, uint256 candidateId);
    event CandidateAdded(uint256 candidateId, string name);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyVerified() {
        require(isVerified[msg.sender], "Voter is not verified");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function addCandidate(string memory _name) public onlyAdmin {
        uint256 candidateId = candidates.length;
        candidates.push(Candidate(candidateId, _name, 0));
        emit CandidateAdded(candidateId, _name);
    }

    function verifyVoter(address _voter) public onlyAdmin {
        require(!isVerified[_voter], "Voter is already verified");
        isVerified[_voter] = true;
        emit VoterVerified(_voter);
    }

    function vote(uint256 _candidateId) public {
        require(!hasVoted[msg.sender], "You have already voted");
        require(_candidateId < candidates.length, "Invalid candidate ID");

        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount += 1;

        emit VoteCasted(msg.sender, _candidateId);
    }

    function getAllCandidates() public view returns (Candidate[] memory) {
        return candidates;
    }
}
