import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { StakedERC721__factory } from "../typechain";
import { StakedERC721 } from "../typechain";
import TimeTraveler from "../utils/TimeTraveler";

describe("StakedERC721", function () {

    let deployer: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let account3: SignerWithAddress;
    let account4: SignerWithAddress;
    let signers: SignerWithAddress[];

    let stakedNFT: StakedERC721;
    
    const timeTraveler = new TimeTraveler(hre.network.provider);

    before(async() => {
        [
            deployer,
            account1,
            account2,
            account3,
            account4,
            ...signers
        ] = await hre.ethers.getSigners();

        const stakedERC721Factory = await new StakedERC721__factory(deployer);
        stakedNFT = await stakedERC721Factory.deploy("TestNFT", "TNFT","https://test.com/");

        await timeTraveler.snapshot();
    });

    beforeEach(async() => {
        await timeTraveler.revertSnapshot();
    });

    describe("setBaseURI", async () => {
        const TokenID = 10;
        const stakedInfo = {
            start: Math.floor(Date.now() / 1000),
            duration: 600,
            end: Math.floor(Date.now() / 1000) + 600
        }
        beforeEach(async () => {
            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address);  
            await stakedNFT.connect(account1).safeMint(account2.address, TokenID, stakedInfo);
        })
        
        it("should set the base URI for the contract", async () => {
            
            const newBaseURI = "https://test2.com/";
            await stakedNFT.connect(deployer).setBaseURI(newBaseURI);
            expect(await stakedNFT.tokenURI(TokenID)).to.eq(newBaseURI+TokenID);
        });
    
        it("should revert if called by a non-admin", async () => {
            const TokenID = 10;
            const oldBaseURI = "https://test.com/";
            const newBaseURI = "https://test2.com/";
            await expect(stakedNFT.connect(account2).setBaseURI(newBaseURI)).to.be.revertedWith("StakedERC721.onlyAdmin: permission denied");
            expect(await stakedNFT.tokenURI(TokenID)).to.eq(oldBaseURI+TokenID);
        });
    });

    describe("Transferrable", async() => {

        it("Default not transferrable", async() => {
            const stakedERC721Factory = await new StakedERC721__factory(deployer);
            const newStakedNFT = await stakedERC721Factory.deploy("NewTestNFT", "NTNFT","https://test.com/");
            expect(await newStakedNFT.connect(account1).transferrable()).to.eq(false);
        });

        it("User without admin role cannot enable/disable transfer", async() => {
            await expect(stakedNFT.connect(account1).disableTransfer()).to.be.revertedWith("StakedERC721.onlyAdmin: permission denied");
            await expect(stakedNFT.connect(account1).enableTransfer()).to.be.revertedWith("StakedERC721.onlyAdmin: permission denied");
        });

        it("User with admin role can successfully enable transfer", async() => {
            expect(await stakedNFT.connect(account1).transferrable()).to.eq(false);

            const adminRole = await stakedNFT.ADMIN_ROLE();
            await stakedNFT.grantRole(adminRole, account1.address);

            await stakedNFT.connect(account1).enableTransfer();
            expect(await stakedNFT.connect(account1).transferrable()).to.eq(true);
        });

        it("User with admin role can successfully disable transfer", async() => {
            expect(await stakedNFT.connect(account1).transferrable()).to.eq(false);

            const adminRole = await stakedNFT.ADMIN_ROLE();
            await stakedNFT.grantRole(adminRole, account1.address);

            await stakedNFT.connect(account1).enableTransfer();
            expect(await stakedNFT.connect(account1).transferrable()).to.eq(true);

            await stakedNFT.connect(account1).disableTransfer();
            expect(await stakedNFT.connect(account1).transferrable()).to.eq(false);
        });
    });

    describe("SafeMint", async() => {
        const TOKEN_ID = 10;
        const stakedInfo = {
            start: Math.floor(Date.now() / 1000),
            duration: 600,
            end: Math.floor(Date.now() / 1000) + 600
        }

        it("User without minter role cannot mint", async() => {
            await expect(stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID, stakedInfo)).to.be.revertedWith("StakedERC721.onlyMinter: permission denied");
        });

        it("should return the correct tokenURI for a staked ERC721 token", async () => {

            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address);  
            await stakedNFT.connect(account1).safeMint(account2.address, TOKEN_ID, stakedInfo);
            
            const tokenURI = `https://test.com/${TOKEN_ID}`;
        
            const returnedTokenURI = await stakedNFT.tokenURI(TOKEN_ID);
            expect(returnedTokenURI).to.eq(tokenURI);
        });

        context("Incorrect staked info", () => {
            it("Cannot mint token with end > start", async() => {
                const minterRole = await stakedNFT.MINTER_ROLE();
                await stakedNFT.grantRole(minterRole, account1.address);

                const stakedInfoWithIncorrectEndTime = {
                    start: Math.floor(Date.now() / 1000),
                    duration: 600,
                    end: Math.floor(Date.now() / 1000) - 600
                }
                await expect(stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID, stakedInfoWithIncorrectEndTime)).to.be.revertedWith("StakedERC721.safeMint: StakedInfo.end must be greater than StakedInfo.start");
            });

            it("Cannot mint token with 0 duration", async() => {
                const minterRole = await stakedNFT.MINTER_ROLE();
                await stakedNFT.grantRole(minterRole, account1.address);

                const stakedInfoWithZeroDuration = {
                    start: Math.floor(Date.now() / 1000),
                    duration: 0,
                    end: Math.floor(Date.now() / 1000) + 600
                }
                await expect(stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID, stakedInfoWithZeroDuration)).to.be.revertedWith("StakedERC721.safeMint: StakedInfo.duration must be greater than 0");
            });
        });

        it("Cannot mint already exist token", async() => {
            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address);  
            await stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID, stakedInfo);
            await expect(stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID, stakedInfo)).to.be.revertedWith("ERC721: token already minted");
        });

        it("Can successfully mint", async() => {
            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address);  
            await stakedNFT.connect(account1).safeMint(account2.address, TOKEN_ID, stakedInfo);

            const retrievedStakedInfo = await stakedNFT.stakedInfoOf(TOKEN_ID);
            expect(retrievedStakedInfo.start).to.eq(stakedInfo.start);
            expect(retrievedStakedInfo.end).to.eq(stakedInfo.end);
            expect(retrievedStakedInfo.duration).to.eq(stakedInfo.duration);
            expect(await stakedNFT.ownerOf(TOKEN_ID)).to.eq(account2.address);
        });

    });

    describe("Burn", async() => {
        const TOKEN_ID = 10;
        const DURATION = 6000;
        
        beforeEach(async() => {
            let now = Date.now();
            let stakedInfo = {
                start: Math.floor(now / 1000),
                duration: DURATION,
                end: Math.floor(now / 1000) + DURATION
            };

            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address);  
            await stakedNFT.connect(account1).safeMint(account2.address, TOKEN_ID, stakedInfo);
        });

        it("User without burner role cannot burn", async() => {
            await expect(stakedNFT.connect(account1).burn(TOKEN_ID)).to.be.revertedWith("StakedERC721.onlyBurner: permission denied");
        });

        it("Cannot burn the token if not expired", async() => {
            const timestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;

            let newStakedInfo = {
                start: timestamp,
                duration: DURATION,
                end: timestamp + DURATION
            };

            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address); 
            const newTokenId = 2000; 
            await stakedNFT.connect(account1).safeMint(account2.address, newTokenId, newStakedInfo);

            const burnerRole = await stakedNFT.BURNER_ROLE();
            await stakedNFT.grantRole(burnerRole, account1.address);  

            await expect(stakedNFT.connect(account1).burn(newTokenId)).to.be.revertedWith("StakedERC721.burn: Too soon.");
        });

        it("Cannot burn non-exist token", async() => {
            await timeTraveler.increaseTime(DURATION);

            const burnerRole = await stakedNFT.BURNER_ROLE();
            await stakedNFT.grantRole(burnerRole, account2.address);
            await stakedNFT.connect(account2).burn(TOKEN_ID);
            await expect(stakedNFT.connect(account2).burn(TOKEN_ID)).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("Can successfully burn", async() => {
            await timeTraveler.increaseTime(DURATION);

            const burnerRole = await stakedNFT.BURNER_ROLE();
            await stakedNFT.grantRole(burnerRole, account2.address);
            await stakedNFT.connect(account2).burn(TOKEN_ID);

            await expect(stakedNFT.stakedInfoOf(TOKEN_ID)).to.be.revertedWith("StakedERC721.stakedInfoOf: stakedInfo query for the nonexistent token");
            await expect(stakedNFT.ownerOf(TOKEN_ID)).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });
    });

    describe("Multiple tokens", async() => {
        it("Backend can get all the informations to calculate rewards", async() => {
            let stakedInfo1 = {
                start: Math.floor(Date.now() / 1000),
                duration: 600,
                end: Math.floor(Date.now() / 1000) + 600
            };
            let stakedInfo2 = {
                start: Math.floor(Date.now() / 1000),
                duration: 6000,
                end: Math.floor(Date.now() / 1000) + 6000
            };
            let stakedInfo3 = {
                start: Math.floor(Date.now() / 1000),
                duration: 10,
                end: Math.floor(Date.now() / 1000) + 10
            };
            let stakedInfo4 = {
                start: Math.floor(Date.now() / 1000),
                duration: 86400,
                end: Math.floor(Date.now() / 1000) + 86400
            };

            const minterRole = await stakedNFT.MINTER_ROLE();
            await stakedNFT.grantRole(minterRole, account1.address);
            let TOKEN_ID_1 = 10;
            await stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID_1, stakedInfo1);
            let TOKEN_ID_2 = 40;
            await stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID_2, stakedInfo2);
            let TOKEN_ID_3 = 100;
            await stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID_3, stakedInfo3);
            let TOKEN_ID_4 = 9527;
            await stakedNFT.connect(account1).safeMint(account1.address, TOKEN_ID_4, stakedInfo4);

            let idStakedInfoMap: any = {};
            idStakedInfoMap[TOKEN_ID_1] = stakedInfo1;
            idStakedInfoMap[TOKEN_ID_2] = stakedInfo2;
            idStakedInfoMap[TOKEN_ID_3] = stakedInfo3;
            idStakedInfoMap[TOKEN_ID_4] = stakedInfo4;

            let totalSupply = await stakedNFT.totalSupply();
            for (var i = 0; i < Number(totalSupply); i++) {
                let tokenId = await stakedNFT.tokenByIndex(i);
                let retrievedStakedInfo = await stakedNFT.stakedInfoOf(tokenId);
                let stakedInfo = idStakedInfoMap[tokenId.toNumber()];

                expect(retrievedStakedInfo.start).to.eq(stakedInfo.start);
                expect(retrievedStakedInfo.duration).to.eq(stakedInfo.duration);
                expect(retrievedStakedInfo.end).to.eq(stakedInfo.end);
            }
        });
    });
});