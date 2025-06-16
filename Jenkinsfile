// Jenkinsfile (GitOps Version)
// This pipeline's final stage is to update the Kubernetes manifests in the Git repository.

pipeline {
    agent any

    tools {
        'hudson.plugins.sonar.SonarRunnerInstallation' 'SonarScanner-latest'
    }

    environment {
        AWS_REGION         = 'us-west-2'
        AWS_ACCOUNT_ID     = '889818960214'
        ECR_REPO_NAME      = 'my-app-repo'
        
        GITHUB_TOKEN_ID    = 'my-github-pat' // The ID of your GitHub credential
        
        IMAGE_TAG          = "${BUILD_NUMBER}"
        BACKEND_IMAGE_URL  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:3tier-nodejs-backend-${IMAGE_TAG}"
        FRONTEND_IMAGE_URL = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:3tier-nodejs-frontend-${IMAGE_TAG}"
    }

    stages {
        
        // (Stages for Checkout, SonarQube, Quality Gate, Build & Push remain the same...)
        stage('CI Stages: Checkout, Scan, Build, Push') {
             parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            script {
                                def backendImage = docker.build(env.BACKEND_IMAGE_URL, '.')
                                docker.withRegistry("https://${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com", 'ecr:us-west-2:aws-credentials') {
                                    backendImage.push()
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                def frontendImage = docker.build(env.FRONTEND_IMAGE_URL, '.')
                                docker.withRegistry("https://${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com", 'ecr:us-west-2:aws-credentials') {
                                    frontendImage.push()
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // FINAL STAGE: Update K8s Manifests in GitHub (GitOps Trigger)
        // ==========================================================
        stage('Update Manifests in Git') {
            steps {
                withCredentials([string(credentialsId: GITHUB_TOKEN_ID, variable: 'GITHUB_TOKEN')]) {
                    sh 'git config user.email "jenkins-bot@ci.com"'
                    sh 'git config user.name "Jenkins CI Bot"'
                    
                    sh "sed -i 's|image: .*|image: ${env.BACKEND_IMAGE_URL}|g' ./k8s/02-backend.yaml"
                    sh "sed -i 's|image:.*|image: ${env.FRONTEND_IMAGE_URL}|g' ./k8s/03-frontend.yaml"

                    sh 'git remote set-url origin https://${GITHUB_TOKEN}@github.com/MostafaAssaff/3tier-react-app.git'
                    
                    sh 'git add ./k8s/02-backend.yaml ./k8s/03-frontend.yaml'
                    sh "git commit -m 'Deploy: Update image tags for build #${BUILD_NUMBER}'"
                    sh 'git push origin HEAD:main'
                }
            }
        }
    }
}
